//! Shared application state.

use crate::config::Config;
use crate::db::Db;
use crate::queue::QueueHandle;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub config: Config,
    pub queue: Arc<QueueHandle>,
    pub discord: Arc<Mutex<Option<DiscordControl>>>,
}

pub struct DiscordControl {
    pub shutdown: tokio::sync::watch::Sender<bool>,
}
