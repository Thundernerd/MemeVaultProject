//! Optional Discord slash-command bot (downloads to Discord, not vault).

use crate::config::Config;
use crate::db::{self, Db};
use crate::gallerydl;
use crate::state::{AppState, DiscordControl};
use crate::ytdlp;
use serenity::all::*;
use tokio::sync::watch;

pub async fn restart_discord_bot(state: AppState) {
    // Stop previous
    {
        let mut guard = state.discord.lock().await;
        if let Some(ctrl) = guard.take() {
            let _ = ctrl.shutdown.send(true);
        }
    }

    let enabled = state
        .db
        .with_conn(|c| Ok(db::get_setting(c, "discord_enabled")))
        .ok()
        .flatten()
        .as_deref()
        == Some("true");
    let token = state
        .db
        .with_conn(|c| Ok(db::get_setting(c, "discord_bot_token")))
        .ok()
        .flatten()
        .filter(|s| !s.is_empty());
    let client_id = state
        .db
        .with_conn(|c| Ok(db::get_setting(c, "discord_client_id")))
        .ok()
        .flatten()
        .filter(|s| !s.is_empty());

    if !enabled || token.is_none() || client_id.is_none() {
        tracing::info!("Discord bot not started (disabled or missing credentials)");
        return;
    }

    let token = token.unwrap();
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    {
        let mut guard = state.discord.lock().await;
        *guard = Some(DiscordControl {
            shutdown: shutdown_tx,
        });
    }

    let db = state.db.clone();
    let config = state.config.clone();
    let command_name = state
        .db
        .with_conn(|c| Ok(db::get_setting(c, "discord_command_name")))
        .ok()
        .flatten()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "get".into());

    tokio::spawn(async move {
        if let Err(e) = run_bot(token, command_name, db, config, shutdown_rx).await {
            tracing::error!("Discord bot error: {e:#}");
        }
    });
}

async fn run_bot(
    token: String,
    command_name: String,
    db: Db,
    config: Config,
    mut shutdown: watch::Receiver<bool>,
) -> anyhow::Result<()> {
    struct Handler {
        command_name: String,
        db: Db,
        config: Config,
    }

    #[async_trait::async_trait]
    impl EventHandler for Handler {
        async fn ready(&self, ctx: Context, ready: Ready) {
            tracing::info!("Discord bot logged in as {}", ready.user.name);
            let cmd = CreateCommand::new(&self.command_name)
                .description("Download media and post it here")
                .add_option(
                    CreateCommandOption::new(CommandOptionType::String, "url", "Media URL")
                        .required(true),
                )
                .add_option(
                    CreateCommandOption::new(CommandOptionType::String, "type", "video or image")
                        .add_string_choice("video", "video")
                        .add_string_choice("image", "image"),
                );
            if let Err(e) = Command::create_global_command(&ctx.http, cmd).await {
                tracing::error!("failed to register slash command: {e}");
            }
        }

        async fn interaction_create(&self, ctx: Context, interaction: Interaction) {
            let Interaction::Command(cmd) = interaction else {
                return;
            };
            if cmd.data.name != self.command_name {
                return;
            }
            let url = cmd
                .data
                .options
                .iter()
                .find(|o| o.name == "url")
                .and_then(|o| o.value.as_str())
                .unwrap_or("")
                .to_string();
            let media_type = cmd
                .data
                .options
                .iter()
                .find(|o| o.name == "type")
                .and_then(|o| o.value.as_str())
                .unwrap_or("video");

            let _ = cmd.defer(&ctx.http).await;
            let tmp = tempfile::tempdir().ok();
            let Some(tmp) = tmp else {
                let _ = cmd
                    .edit_response(
                        &ctx.http,
                        EditInteractionResponse::new().content("Failed to create temp dir"),
                    )
                    .await;
                return;
            };

            let (_, cancel_rx) = watch::channel(false);
            let result = if media_type == "image" {
                gallerydl::run_gallery_dl(
                    &self.db,
                    &self.config,
                    &url,
                    None,
                    cancel_rx,
                    Some(tmp.path().to_path_buf()),
                )
                .await
                .map(|files| {
                    files
                        .into_iter()
                        .map(|f| f.file_path)
                        .collect::<Vec<_>>()
                })
            } else {
                ytdlp::run_ytdlp(
                    &self.db,
                    &self.config,
                    &url,
                    None,
                    cancel_rx,
                    Some(tmp.path().to_path_buf()),
                )
                .await
                .map(|r| vec![r.file_path])
            };

            match result {
                Ok(paths) if !paths.is_empty() => {
                    let _ = cmd
                        .edit_response(
                            &ctx.http,
                            EditInteractionResponse::new()
                                .content(format!("Downloaded {} file(s) from <{url}>", paths.len())),
                        )
                        .await;
                    for p in paths.iter().take(10) {
                        if let Ok(att) = CreateAttachment::path(p).await {
                            let _ = cmd
                                .create_followup(
                                    &ctx.http,
                                    CreateInteractionResponseFollowup::new().add_file(att),
                                )
                                .await;
                        }
                    }
                }
                Ok(_) => {
                    let _ = cmd
                        .edit_response(
                            &ctx.http,
                            EditInteractionResponse::new().content("No files downloaded"),
                        )
                        .await;
                }
                Err(e) => {
                    let _ = cmd
                        .edit_response(
                            &ctx.http,
                            EditInteractionResponse::new()
                                .content(format!("Download failed: {e}")),
                        )
                        .await;
                }
            }
        }
    }

    let handler = Handler {
        command_name,
        db,
        config,
    };
    let mut client = Client::builder(&token, GatewayIntents::empty())
        .event_handler(handler)
        .await?;

    tokio::select! {
        r = client.start() => { r?; }
        _ = shutdown.changed() => {
            tracing::info!("Discord bot shutting down");
        }
    }
    Ok(())
}

pub async fn start_if_configured(state: AppState) {
    restart_discord_bot(state).await;
}
