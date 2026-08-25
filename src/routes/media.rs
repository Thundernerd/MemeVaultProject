use crate::db;
use crate::error::{AppError, AppResult};
use crate::files::{self, serve_file_with_range};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use std::path::Path as FsPath;

pub async fn list(State(state): State<AppState>) -> AppResult<Json<Vec<db::MediaItemWithTags>>> {
    let items = state
        .db
        .with_conn(|c| Ok(db::list_media_items_with_tags(c)?))?;
    Ok(Json(items))
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<db::MediaItemWithTags>> {
    let item = state
        .db
        .with_conn(|c| Ok(db::get_media_item_with_tags(c, &id)?))?
        .ok_or(AppError::NotFound)?;
    Ok(Json(item))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchBody {
    pub include_in_random: Option<bool>,
}

pub async fn patch(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<PatchBody>,
) -> AppResult<Json<db::MediaItemWithTags>> {
    let exists = state
        .db
        .with_conn(|c| Ok(db::get_media_item(c, &id)?))?
        .ok_or(AppError::NotFound)?;
    let _ = exists;
    if let Some(flag) = body.include_in_random {
        state.db.with_conn(|c| {
            db::set_media_random_flag(c, &id, flag)?;
            Ok(())
        })?;
    }
    let item = state
        .db
        .with_conn(|c| Ok(db::get_media_item_with_tags(c, &id)?))?
        .ok_or(AppError::NotFound)?;
    Ok(Json(item))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    let item = state.db.with_conn(|c| Ok(db::delete_media_item(c, &id)?))?;
    let Some(item) = item else {
        return Err(AppError::NotFound);
    };
    files::delete_job_dir(&item.file_path);
    Ok(StatusCode::NO_CONTENT)
}

pub async fn file(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    let item = state
        .db
        .with_conn(|c| Ok(db::get_media_item(c, &id)?))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;
    serve_file_with_range(FsPath::new(&item.file_path), &headers, false).await
}

pub async fn thumbnail(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    let item = state
        .db
        .with_conn(|c| Ok(db::get_media_item(c, &id)?))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;
    let path = item.thumbnail_path.ok_or(StatusCode::NOT_FOUND)?;
    serve_file_with_range(FsPath::new(&path), &headers, false).await
}

pub async fn get_tags(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<db::Tag>>> {
    state
        .db
        .with_conn(|c| Ok(db::get_media_item(c, &id)?))?
        .ok_or(AppError::NotFound)?;
    let tags = state.db.with_conn(|c| Ok(db::get_tags_for_media(c, &id)?))?;
    Ok(Json(tags))
}

#[derive(Deserialize)]
pub struct PutTagsBody {
    pub tags: Vec<String>,
}

pub async fn put_tags(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<PutTagsBody>,
) -> AppResult<Json<Vec<db::Tag>>> {
    state
        .db
        .with_conn(|c| Ok(db::get_media_item(c, &id)?))?
        .ok_or(AppError::NotFound)?;
    let tags = state
        .db
        .with_conn(|c| Ok(db::set_tags_for_media(c, &id, &body.tags)?))?;
    Ok(Json(tags))
}

#[derive(Deserialize)]
pub struct PostTagBody {
    pub name: String,
}

pub async fn post_tag(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<PostTagBody>,
) -> AppResult<(StatusCode, Json<db::Tag>)> {
    state
        .db
        .with_conn(|c| Ok(db::get_media_item(c, &id)?))?
        .ok_or(AppError::NotFound)?;
    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::bad_request("name required"));
    }
    let tag = state.db.with_conn(|c| {
        let tag = db::upsert_tag(c, name)?;
        db::add_tag_to_media(c, &id, &tag.id)?;
        Ok(tag)
    })?;
    Ok((StatusCode::CREATED, Json(tag)))
}

pub async fn list_shares(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<db::ShareLink>>> {
    state
        .db
        .with_conn(|c| Ok(db::get_media_item(c, &id)?))?
        .ok_or(AppError::NotFound)?;
    let links = state
        .db
        .with_conn(|c| Ok(db::get_share_links_for_media(c, &id)?))?;
    Ok(Json(links))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateShareBody {
    pub allow_download: Option<bool>,
    pub expires_at: Option<String>,
}

pub async fn create_share(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<CreateShareBody>,
) -> AppResult<(StatusCode, Json<db::ShareLink>)> {
    state
        .db
        .with_conn(|c| Ok(db::get_media_item(c, &id)?))?
        .ok_or(AppError::NotFound)?;
    let allow = body.allow_download.unwrap_or(true);
    let expires = body.expires_at.as_deref();
    let link = state
        .db
        .with_conn(|c| Ok(db::create_share_link(c, &id, allow, expires)?))?;
    Ok((StatusCode::CREATED, Json(link)))
}

pub async fn delete_share(
    State(state): State<AppState>,
    Path((id, token)): Path<(String, String)>,
) -> AppResult<StatusCode> {
    let _ = id;
    state.db.with_conn(|c| {
        db::delete_share_link(c, &token)?;
        Ok(())
    })?;
    Ok(StatusCode::NO_CONTENT)
}
