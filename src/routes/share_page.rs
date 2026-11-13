use crate::db;
use crate::error::{AppError, AppResult};
use crate::files::mime_type;
use crate::state::AppState;
use askama::Template;
use axum::extract::{Path, State};
use axum::response::{Html, IntoResponse, Response};
use std::path::Path as FsPath;

#[derive(Template)]
#[template(path = "share.html")]
struct ShareTemplate {
    title: String,
    media_type: String,
    file_src: String,
    thumbnail_src: Option<String>,
    allow_download: bool,
    is_album: bool,
    album_items_json: String,
    og_meta: String,
}

pub async fn page(State(state): State<AppState>, Path(token): Path<String>) -> AppResult<Response> {
    // Album share?
    if let Some(album_link) = state
        .db
        .with_conn(|c| Ok(db::get_album_share_link(c, &token)?))?
    {
        if db::is_share_expired(&album_link.expires_at) {
            return Err(AppError::NotFound);
        }
        let album = state
            .db
            .with_conn(|c| Ok(db::get_album_with_media(c, &album_link.album_id)?))?
            .ok_or(AppError::NotFound)?;
        let title = album
            .album
            .title
            .clone()
            .unwrap_or_else(|| "Shared album".into());
        let base = state
            .db
            .with_conn(|c| Ok(db::get_setting(c, "share_base_url")))?
            .unwrap_or_default()
            .trim_end_matches('/')
            .to_string();
        let first = album.media.first();
        let mut og = String::new();
        if !base.is_empty() {
            if let Some(f) = first {
                let thumb = if f.media.thumbnail_path.is_some() {
                    format!("{base}/api/share/{token}/media/{}/thumbnail", f.media.id)
                } else {
                    format!("{base}/api/share/{token}/media/{}/file", f.media.id)
                };
                og.push_str(&format!(
                    r#"<meta property="og:type" content="website" />
<meta property="og:title" content="{}" />
<meta property="og:image" content="{thumb}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{}" />
<meta name="twitter:image" content="{thumb}" />"#,
                    html_escape(&title),
                    html_escape(&title),
                ));
            }
        }
        let items: Vec<_> = album
            .media
            .iter()
            .map(|m| {
                serde_json::json!({
                    "id": m.media.id,
                    "type": m.media.media_type,
                    "title": m.media.title,
                    "has_thumbnail": m.media.thumbnail_path.is_some(),
                })
            })
            .collect();
        let tmpl = ShareTemplate {
            title,
            media_type: "album".into(),
            file_src: String::new(),
            thumbnail_src: None,
            allow_download: album_link.allow_download == 1,
            is_album: true,
            album_items_json: script_json(&serde_json::Value::Array(items)),
            og_meta: og,
        };
        return Ok(Html(
            tmpl.render()
                .map_err(|e| AppError::internal(e.to_string()))?,
        )
        .into_response());
    }

    let link = state
        .db
        .with_conn(|c| Ok(db::get_share_link(c, &token)?))?
        .ok_or(AppError::NotFound)?;
    if db::is_share_expired(&link.expires_at) {
        return Err(AppError::NotFound);
    }
    let media = state
        .db
        .with_conn(|c| Ok(db::get_media_item(c, &link.media_id)?))?
        .ok_or(AppError::NotFound)?;

    let title = media.title.clone().unwrap_or_else(|| "Shared media".into());
    let file_src = format!("/api/share/{token}/file");
    let thumbnail_src = media
        .thumbnail_path
        .as_ref()
        .map(|_| format!("/api/share/{token}/thumbnail"));
    let base = state
        .db
        .with_conn(|c| Ok(db::get_setting(c, "share_base_url")))?
        .unwrap_or_default()
        .trim_end_matches('/')
        .to_string();

    let mut og = String::new();
    if !base.is_empty() {
        let abs_file = format!("{base}{file_src}");
        let abs_thumb = thumbnail_src.as_ref().map(|t| format!("{base}{t}"));
        let ext = FsPath::new(&media.file_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        let mut video_mime = mime_type(ext).to_string();
        if video_mime == "application/octet-stream" {
            video_mime = "video/mp4".into();
        }
        if media.media_type == "video" {
            og.push_str(&format!(
                r#"<meta property="og:type" content="video.other" />
<meta property="og:title" content="{}" />
<meta property="og:video" content="{abs_file}" />
<meta property="og:video:type" content="{video_mime}" />
<meta name="twitter:card" content="player" />
<meta name="twitter:title" content="{}" />
<meta name="twitter:player" content="{base}/share/{token}" />
<meta name="twitter:player:stream" content="{abs_file}" />
<meta name="twitter:player:stream:content_type" content="{video_mime}" />"#,
                html_escape(&title),
                html_escape(&title),
            ));
            if let Some(t) = &abs_thumb {
                og.push_str(&format!(
                    r#"
<meta property="og:image" content="{t}" />
<meta name="twitter:image" content="{t}" />"#
                ));
            }
        } else {
            let img = abs_thumb.unwrap_or(abs_file);
            og.push_str(&format!(
                r#"<meta property="og:type" content="website" />
<meta property="og:title" content="{}" />
<meta property="og:image" content="{img}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{}" />
<meta name="twitter:image" content="{img}" />"#,
                html_escape(&title),
                html_escape(&title),
            ));
        }
    }

    let tmpl = ShareTemplate {
        title,
        media_type: media.media_type,
        file_src,
        thumbnail_src,
        allow_download: link.allow_download == 1,
        is_album: false,
        album_items_json: "[]".into(),
        og_meta: og,
    };
    Ok(Html(
        tmpl.render()
            .map_err(|e| AppError::internal(e.to_string()))?,
    )
    .into_response())
}

/// JSON for embedding in an inline `<script>`: escapes `<` so a value such as
/// a media title containing `</script>` cannot close the script block.
fn script_json(value: &serde_json::Value) -> String {
    serde_json::to_string(value)
        .unwrap_or_else(|_| "[]".into())
        .replace('<', "\\u003c")
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::script_json;
    use regex::Regex;
    use std::collections::BTreeMap;

    #[test]
    fn script_json_cannot_close_the_script_block() {
        let items = serde_json::json!([{ "title": "</script><script>alert(1)</script>" }]);
        let out = script_json(&items);
        assert!(!out.contains("</"), "unescaped `</` in {out}");
        let back: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(back, items);
    }

    /// share.html keeps its own copy of the design tokens so the page stays
    /// self-contained (#31). This keeps that copy honest:
    /// - both files define the same `[data-theme]` / `[data-accent]` blocks;
    /// - each token block share.html declares appears exactly once in each file;
    /// - every custom property in it has the same value in style.css's block.
    ///
    /// share.html may declare a subset of a block's tokens (it has no
    /// --header-h / --shell-max).
    #[test]
    fn share_page_tokens_match_the_app_stylesheet() {
        const SHARE: &str = include_str!("../../templates/share.html");
        const APP: &str = include_str!("../../frontend/src/style.css");
        let share = token_blocks(SHARE);
        let app = token_blocks(APP);

        let themed = |blocks: &BTreeMap<String, Vec<Tokens>>| -> Vec<String> {
            blocks
                .keys()
                .filter(|s| s.starts_with("[data-theme=") || s.starts_with("[data-accent="))
                .cloned()
                .collect()
        };
        assert_eq!(
            themed(&share),
            themed(&app),
            "share.html and style.css define different theme/accent blocks"
        );
        assert!(
            share.contains_key(":root"),
            "share.html has no :root tokens"
        );

        let mut drift = Vec::new();
        for (selector, share_blocks) in &share {
            let [share_tokens] = share_blocks.as_slice() else {
                panic!(
                    "share.html has {} `{selector}` token blocks",
                    share_blocks.len()
                );
            };
            let app_tokens = match app.get(selector).map(Vec::as_slice) {
                Some([one]) => one,
                Some(many) => panic!("style.css has {} `{selector}` token blocks", many.len()),
                None => {
                    drift.push(format!("{selector}: no such block in style.css"));
                    continue;
                }
            };
            for (name, value) in share_tokens {
                match app_tokens.get(name) {
                    Some(app_value) if app_value == value => {}
                    Some(app_value) => drift.push(format!(
                        "{selector} {name}: share.html `{value}`, style.css `{app_value}`"
                    )),
                    None => drift.push(format!("{selector} {name}: not in style.css")),
                }
            }
        }
        assert!(
            drift.is_empty(),
            "templates/share.html tokens drifted from frontend/src/style.css:\n{}",
            drift.join("\n")
        );
    }

    /// The theme and accent names are copied out of style.css (the source of
    /// truth: its `[data-theme="…"]` / `[data-accent="…"]` token blocks) into
    /// THEMES / ACCENTS in theme.ts and the pre-paint scripts of share.html and
    /// the app's index.html. A name missing from a copy makes a viewer who saved
    /// it fall back to the default.
    #[test]
    fn theme_and_accent_name_lists_match_the_app_stylesheet() {
        const APP: &str = include_str!("../../frontend/src/style.css");
        const THEME_TS: &str = include_str!("../../frontend/src/theme.ts");
        const SHARE: &str = include_str!("../../templates/share.html");
        const INDEX: &str = include_str!("../../frontend/index.html");
        let themes = css_names(APP, "data-theme");
        let accents = css_names(APP, "data-accent");
        assert!(!themes.is_empty(), "no [data-theme] blocks in style.css");
        assert!(!accents.is_empty(), "no [data-accent] blocks in style.css");

        let ts = |name| ts_list(THEME_TS, name);
        let share = |var| script_list(SHARE, "templates/share.html", var);
        let index = |var| script_list(INDEX, "frontend/index.html", var);
        let copies = [
            ("THEMES in frontend/src/theme.ts", ts("THEMES"), &themes),
            ("ACCENTS in frontend/src/theme.ts", ts("ACCENTS"), &accents),
            ("themes in templates/share.html", share("theme"), &themes),
            ("accents in templates/share.html", share("accent"), &accents),
            ("themes in frontend/index.html", index("theme"), &themes),
            ("accents in frontend/index.html", index("accent"), &accents),
        ];
        for (copy, names, expected) in copies {
            assert_eq!(&names, expected, "{copy} differ from the style.css blocks");
        }
    }

    /// Every hard-coded fallback theme / accent (share.html's `<html>` tag, the
    /// pre-paint scripts' fallback and `catch`, theme.ts's `readStored` calls)
    /// names a style.css block, so a viewer who falls back still gets tokens.
    #[test]
    fn theme_and_accent_fallback_defaults_have_a_stylesheet_block() {
        const APP: &str = include_str!("../../frontend/src/style.css");
        for (attr, sites) in fallback_defaults() {
            let names = css_names(APP, attr);
            for (site, value) in sites {
                assert!(
                    names.contains(&value),
                    "{site} falls back to {attr} `{value}`, which has no style.css block \
                     (blocks: {names:?})"
                );
            }
        }
    }

    /// The app and the share page agree on one default theme and one default
    /// accent, so a viewer with nothing saved sees the same look on both.
    #[test]
    fn theme_and_accent_fallback_defaults_agree() {
        for (attr, sites) in fallback_defaults() {
            let (first_site, first) = &sites[0];
            let disagree: Vec<_> = sites.iter().filter(|(_, v)| v != first).collect();
            assert!(
                disagree.is_empty(),
                "{first_site} defaults {attr} to `{first}`, but {disagree:?} differ"
            );
        }
    }

    /// For `data-theme` and `data-accent`: each fallback-default site and the
    /// name it hard-codes.
    fn fallback_defaults() -> [(&'static str, Vec<(String, String)>); 2] {
        const THEME_TS: &str = include_str!("../../frontend/src/theme.ts");
        const SHARE: &str = include_str!("../../templates/share.html");
        const INDEX: &str = include_str!("../../frontend/index.html");
        let sites = |attr: &str, var: &str, list: &str, key: &str| {
            let mut found = vec![
                one_capture(
                    SHARE,
                    "templates/share.html <html>",
                    &format!(r#"<html[^>]*\s{attr}="([^"]+)""#),
                ),
                one_capture(
                    THEME_TS,
                    "frontend/src/theme.ts readStored",
                    &format!(r"readStored\({key},\s*{list},\s*'([^']+)'\)"),
                ),
            ];
            for (src, file) in [
                (SHARE, "templates/share.html"),
                (INDEX, "frontend/index.html"),
            ] {
                found.push(one_capture(
                    src,
                    &format!("{file} script fallback"),
                    &format!(r"\b{var}\s*=\s*'([^']+)'"),
                ));
                found.push(one_capture(
                    src,
                    &format!("{file} script catch"),
                    &format!(r"catch\s*\(\w*\)\s*\{{[^}}]*?setAttribute\('{attr}',\s*'([^']+)'\)"),
                ));
            }
            found
        };
        [
            (
                "data-theme",
                sites("data-theme", "theme", "THEMES", "THEME_KEY"),
            ),
            (
                "data-accent",
                sites("data-accent", "accent", "ACCENTS", "ACCENT_KEY"),
            ),
        ]
    }

    /// `(site, x)` for the one match of `pattern` (capturing `x`) in `src`;
    /// panics if there isn't exactly one.
    fn one_capture(src: &str, site: &str, pattern: &str) -> (String, String) {
        let re = Regex::new(pattern).unwrap();
        let found: Vec<_> = re.captures_iter(src).collect();
        let [one] = found.as_slice() else {
            panic!(
                "{site}: expected one match of `{pattern}`, found {}",
                found.len()
            );
        };
        (site.to_string(), one[1].to_string())
    }

    /// Sorted names `x` of the `[attr="x"]` token blocks in `css`.
    fn css_names(css: &str, attr: &str) -> Vec<String> {
        let selector = Regex::new(&format!(r#"^\[{attr}="([^"]+)"\]$"#)).unwrap();
        let mut names: Vec<String> = token_blocks(css)
            .keys()
            .filter_map(|s| Some(selector.captures(s)?[1].to_string()))
            .collect();
        names.sort();
        names
    }

    /// Sorted string literals of `[…]` (a JS array literal) found by the
    /// regex `before` + `\[([^\]]*)\]` + `after`; panics if there isn't exactly one.
    fn js_array(src: &str, file: &str, before: &str, after: &str) -> Vec<String> {
        let (_, array) = one_capture(src, file, &format!(r"{before}\[([^\]]*)\]{after}"));
        let literal = Regex::new(r#"'([^']*)'|"([^"]*)""#).unwrap();
        let mut names: Vec<String> = literal
            .captures_iter(&array)
            .map(|c| c.get(1).or(c.get(2)).unwrap().as_str().to_string())
            .collect();
        names.sort();
        names
    }

    /// The names in theme.ts's `export const <name> = [ … ]`.
    fn ts_list(ts: &str, name: &str) -> Vec<String> {
        let before = format!(r"export const {name}\s*=\s*");
        js_array(ts, "frontend/src/theme.ts", &before, "")
    }

    /// The names in a pre-paint script's `[ … ].indexOf(<var>)` allow-list.
    fn script_list(html: &str, file: &str, var: &str) -> Vec<String> {
        js_array(html, file, "", &format!(r"\.indexOf\({var}\)"))
    }

    /// Custom property name → value, with whitespace in values collapsed.
    type Tokens = BTreeMap<String, String>;

    /// Every brace-free rule (`selector { … }`, not an `@` rule) that declares
    /// at least one custom property, grouped by selector. A rule nested in
    /// `@media` / `@layer` counts too, so a second block with the same
    /// selector shows up as a duplicate instead of being silently merged.
    fn token_blocks(css: &str) -> BTreeMap<String, Vec<Tokens>> {
        let css = Regex::new(r"(?s)/\*.*?\*/").unwrap().replace_all(css, "");
        let rule = Regex::new(r"(?m)^[ \t]*([^\s{}@][^{}\n]*?)[ \t]*\{([^{}]*)\}").unwrap();
        let mut blocks: BTreeMap<String, Vec<Tokens>> = BTreeMap::new();
        for c in rule.captures_iter(&css) {
            let tokens: Tokens = c[2]
                .split(';')
                .filter_map(|decl| {
                    let (name, value) = decl.split_once(':')?;
                    let name = name.trim();
                    let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
                    name.starts_with("--").then(|| (name.to_string(), value))
                })
                .collect();
            if !tokens.is_empty() {
                blocks.entry(c[1].to_string()).or_default().push(tokens);
            }
        }
        blocks
    }
}
