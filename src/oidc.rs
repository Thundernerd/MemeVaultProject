//! Optional OIDC authentication (generic provider).

use crate::config::Config;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::extract::{Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Redirect, Response};
use axum::Json;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use openidconnect::core::{CoreClient, CoreProviderMetadata, CoreResponseType};
use openidconnect::reqwest::async_http_client;
use openidconnect::{
    AuthenticationFlow, AuthorizationCode, ClientId, ClientSecret, CsrfToken, IssuerUrl, Nonce,
    RedirectUrl, Scope,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::RwLock;

const SESSION_COOKIE: &str = "mvp_session";

#[derive(Clone)]
pub struct OidcState {
    pub client: CoreClient,
    pub pending: Arc<RwLock<std::collections::HashMap<String, String>>>, // csrf -> nonce
}

#[derive(Debug, Serialize, Deserialize)]
struct SessionClaims {
    sub: String,
    exp: usize,
}

pub async fn try_build_oidc(config: &Config) -> anyhow::Result<Option<OidcState>> {
    if !config.oidc_enabled() {
        return Ok(None);
    }
    let issuer = config.oidc_issuer.clone().unwrap();
    let client_id = config.oidc_client_id.clone().unwrap();
    let client_secret = config.oidc_client_secret.clone().unwrap();
    let auth_url = config
        .auth_url
        .clone()
        .unwrap_or_else(|| "http://localhost:3000".into());

    let metadata = CoreProviderMetadata::discover_async(
        IssuerUrl::new(issuer)?,
        async_http_client,
    )
    .await?;

    let client = CoreClient::from_provider_metadata(
        metadata,
        ClientId::new(client_id),
        Some(ClientSecret::new(client_secret)),
    )
    .set_redirect_uri(RedirectUrl::new(format!(
        "{}/api/auth/callback/oidc",
        auth_url.trim_end_matches('/')
    ))?);

    Ok(Some(OidcState {
        client,
        pending: Arc::new(RwLock::new(std::collections::HashMap::new())),
    }))
}

pub fn is_exempt_path(path: &str) -> bool {
    path.starts_with("/share/")
        || path.starts_with("/auth/")
        || path.starts_with("/api/auth/")
        || path.starts_with("/api/share/")
        || path.starts_with("/api/v1/")
        || path.starts_with("/assets/")
        || path == "/favicon.ico"
        || path == "/safe.png"
        || path.ends_with(".js")
        || path.ends_with(".css")
        || path.ends_with(".svg")
        || path.ends_with(".png")
        || path.ends_with(".ico")
        || path.ends_with(".woff2")
}

pub fn session_valid(config: &Config, headers: &HeaderMap) -> bool {
    if !config.oidc_enabled() {
        return true;
    }
    let Some(secret) = config.auth_secret.as_ref() else {
        return false;
    };
    let Some(cookie_hdr) = headers.get(header::COOKIE).and_then(|v| v.to_str().ok()) else {
        return false;
    };
    let token = cookie_hdr.split(';').find_map(|part| {
        let part = part.trim();
        part.strip_prefix(&format!("{SESSION_COOKIE}="))
            .map(|s| s.to_string())
    });
    let Some(token) = token else {
        return false;
    };
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    decode::<SessionClaims>(
        &token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .is_ok()
}

#[derive(Deserialize)]
pub struct LoginQuery {
    pub callback_url: Option<String>,
}

pub async fn login_start(
    State(_state): State<AppState>,
    oidc: Arc<OidcState>,
    Query(q): Query<LoginQuery>,
) -> AppResult<Response> {
    let (auth_url, csrf, nonce) = oidc
        .client
        .authorize_url(
            AuthenticationFlow::<CoreResponseType>::AuthorizationCode,
            CsrfToken::new_random,
            Nonce::new_random,
        )
        .add_scope(Scope::new("openid".into()))
        .add_scope(Scope::new("profile".into()))
        .add_scope(Scope::new("email".into()))
        .url();

    oidc.pending
        .write()
        .await
        .insert(csrf.secret().clone(), nonce.secret().clone());

    // Store callback in cookie via redirect — simplified: ignore callback for now
    let _ = q.callback_url;
    Ok(Redirect::temporary(auth_url.as_str()).into_response())
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

pub async fn oidc_callback(
    State(state): State<AppState>,
    oidc: Arc<OidcState>,
    Query(q): Query<CallbackQuery>,
) -> AppResult<Response> {
    if q.error.is_some() {
        return Ok(Redirect::temporary("/auth/error").into_response());
    }
    let code = q.code.ok_or_else(|| AppError::bad_request("missing code"))?;
    let csrf = q.state.ok_or_else(|| AppError::bad_request("missing state"))?;
    let nonce = oidc
        .pending
        .write()
        .await
        .remove(&csrf)
        .ok_or_else(|| AppError::bad_request("invalid state"))?;

    let token_response = oidc
        .client
        .exchange_code(AuthorizationCode::new(code))
        .request_async(async_http_client)
        .await
        .map_err(|e| AppError::internal(format!("token exchange: {e}")))?;

    let id_token = token_response
        .extra_fields()
        .id_token()
        .ok_or_else(|| AppError::internal("no id_token"))?;
    let claims = id_token
        .claims(&oidc.client.id_token_verifier(), &Nonce::new(nonce))
        .map_err(|e| AppError::internal(format!("id_token: {e}")))?;

    let secret = state
        .config
        .auth_secret
        .as_ref()
        .ok_or_else(|| AppError::internal("AUTH_SECRET required"))?;

    let exp = (chrono::Utc::now() + chrono::Duration::days(7)).timestamp() as usize;
    let claims = SessionClaims {
        sub: claims.subject().to_string(),
        exp,
    };
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::internal(e.to_string()))?;

    let cookie = format!(
        "{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}",
        60 * 60 * 24 * 7
    );
    Ok((
        StatusCode::FOUND,
        [(header::SET_COOKIE, cookie), (header::LOCATION, "/".into())],
    )
        .into_response())
}

pub async fn logout(State(state): State<AppState>) -> Response {
    let cookie = format!("{SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0");
    let _ = state;
    (
        StatusCode::FOUND,
        [(header::SET_COOKIE, cookie), (header::LOCATION, "/auth/login".into())],
    )
        .into_response()
}

pub async fn session_info(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    Json(json!({
        "oidcEnabled": state.config.oidc_enabled(),
        "authenticated": session_valid(&state.config, &headers),
    }))
}
