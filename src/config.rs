//! Application configuration from environment variables.

use std::env;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Config {
    pub data_dir: PathBuf,
    pub bind: String,
    pub log_level: String,
    pub static_dir: PathBuf,
    pub oidc_issuer: Option<String>,
    pub oidc_client_id: Option<String>,
    pub oidc_client_secret: Option<String>,
    pub auth_secret: Option<String>,
    pub auth_url: Option<String>,
    pub legacy_api_key: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        let data_dir = env::var("MEMEVAULTPROJECT_DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                dirs_home()
                    .map(|h| h.join(".memevaultproject"))
                    .unwrap_or_else(|| PathBuf::from(".memevaultproject"))
            });

        let static_dir = env::var("MEMEVAULTPROJECT_STATIC_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("frontend/dist"));

        Self {
            data_dir,
            bind: env::var("MEMEVAULTPROJECT_BIND").unwrap_or_else(|_| "0.0.0.0:3000".into()),
            log_level: env::var("MEMEVAULTPROJECT_LOG_LEVEL").unwrap_or_else(|_| "info".into()),
            static_dir,
            oidc_issuer: nonempty_env("MEMEVAULTPROJECT_OIDC_ISSUER"),
            oidc_client_id: nonempty_env("MEMEVAULTPROJECT_OIDC_CLIENT_ID"),
            oidc_client_secret: nonempty_env("MEMEVAULTPROJECT_OIDC_CLIENT_SECRET"),
            auth_secret: nonempty_env("AUTH_SECRET"),
            auth_url: nonempty_env("AUTH_URL"),
            legacy_api_key: nonempty_env("MEMEVAULTPROJECT_API_KEY"),
        }
    }

    pub fn oidc_enabled(&self) -> bool {
        self.oidc_issuer.is_some()
            && self.oidc_client_id.is_some()
            && self.oidc_client_secret.is_some()
    }

    pub fn db_path(&self) -> PathBuf {
        self.data_dir.join("memevaultproject.db")
    }

    pub fn bin_dir(&self) -> PathBuf {
        self.data_dir.join("bin")
    }

    pub fn cookies_dir(&self) -> PathBuf {
        self.data_dir.join("cookies")
    }
}

fn nonempty_env(key: &str) -> Option<String> {
    env::var(key).ok().filter(|s| !s.is_empty())
}

fn dirs_home() -> Option<PathBuf> {
    env::var_os("HOME").map(PathBuf::from)
}
