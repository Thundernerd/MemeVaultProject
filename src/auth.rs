//! API key validation for `/api/v1/*`.

use crate::config::Config;
use crate::db::{self, ApiKey, Db};
use subtle::ConstantTimeEq;

#[derive(Clone, Debug)]
pub struct ApiKeyContext {
    pub id: String,
    pub permission: String,
}

impl ApiKeyContext {
    pub fn has_read(&self) -> bool {
        self.permission == "read" || self.permission == "read_write"
    }
    pub fn has_write(&self) -> bool {
        self.permission == "read_write"
    }
}

pub fn validate_api_key(db: &Db, config: &Config, header: Option<&str>) -> Option<ApiKeyContext> {
    let key = header?.trim();
    if key.is_empty() {
        return None;
    }

    let found = db
        .with_conn(|conn| {
            let k = db::get_api_key_by_value(conn, key).map_err(crate::error::AppError::from)?;
            if let Some(ref api_key) = k {
                let _ = db::touch_api_key_last_used(conn, &api_key.id);
            }
            Ok(k)
        })
        .ok()
        .flatten();

    if let Some(ApiKey { id, permission, .. }) = found {
        let ctx = ApiKeyContext { id, permission };
        tracing::debug!(key_id = %ctx.id, permission = %ctx.permission, "api key accepted");
        return Some(ctx);
    }

    if let Some(ref legacy) = config.legacy_api_key {
        if constant_time_eq(legacy.as_bytes(), key.as_bytes()) {
            let ctx = ApiKeyContext {
                id: "__env__".into(),
                permission: "read_write".into(),
            };
            tracing::debug!(key_id = %ctx.id, permission = %ctx.permission, "api key accepted");
            return Some(ctx);
        }
    }

    None
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    bool::from(a.ct_eq(b))
}
