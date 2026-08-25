//! Optional Discord slash-command bot (downloads to Discord, not vault).

use crate::config::Config;
use crate::db::{self, Db};
use crate::gallerydl;
use crate::state::{AppState, DiscordControl};
use crate::ytdlp;
use serenity::all::*;
use std::path::PathBuf;
use tokio::sync::watch;

const WEBHOOK_NAME: &str = "MemeVault";

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

fn post_as_user_enabled(db: &Db) -> bool {
    db.with_conn(|c| Ok(db::get_setting(c, "discord_post_as_user")))
        .ok()
        .flatten()
        .as_deref()
        == Some("true")
}

fn sender_display_name(cmd: &CommandInteraction) -> String {
    if let Some(member) = &cmd.member {
        member.display_name().to_string()
    } else {
        cmd.user.display_name().to_string()
    }
}

fn sender_avatar_url(cmd: &CommandInteraction) -> String {
    if let Some(member) = &cmd.member {
        member.face()
    } else {
        cmd.user.face()
    }
}

/// Discord webhook usernames: 1–80 chars; no @ # : `; avoid banned substrings.
fn sanitize_webhook_username(name: &str) -> String {
    let mut s: String = name
        .chars()
        .filter(|c| !matches!(c, '@' | '#' | ':' | '`'))
        .collect();
    for banned in ["discord", "clyde", "everyone", "here"] {
        let lower = s.to_lowercase();
        if let Some(idx) = lower.find(banned) {
            s.replace_range(idx..idx + banned.len(), "user");
        }
    }
    s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if s.chars().count() > 80 {
        s = s.chars().take(80).collect();
    }
    if s.chars().count() < 2 {
        "User".into()
    } else {
        s
    }
}

fn webhook_channel_and_thread(cmd: &CommandInteraction) -> (ChannelId, Option<ChannelId>) {
    if let Some(channel) = &cmd.channel {
        match channel.kind {
            ChannelType::PublicThread | ChannelType::PrivateThread | ChannelType::NewsThread => {
                if let Some(parent) = channel.parent_id {
                    return (parent, Some(cmd.channel_id));
                }
            }
            _ => {}
        }
    }
    (cmd.channel_id, None)
}

async fn get_or_create_webhook(
    http: impl AsRef<Http>,
    channel_id: ChannelId,
    bot_user_id: UserId,
) -> serenity::Result<Webhook> {
    let http = http.as_ref();
    let webhooks = channel_id.webhooks(http).await?;
    if let Some(existing) = webhooks.into_iter().find(|w| {
        w.name.as_deref() == Some(WEBHOOK_NAME)
            && w.token.is_some()
            && w.user.as_ref().is_some_and(|u| u.id == bot_user_id)
    }) {
        return Ok(existing);
    }
    channel_id
        .create_webhook(http, CreateWebhook::new(WEBHOOK_NAME))
        .await
}

async fn load_attachments(paths: &[PathBuf]) -> Vec<CreateAttachment> {
    let mut out = Vec::new();
    for p in paths.iter().take(10) {
        if let Ok(att) = CreateAttachment::path(p).await {
            out.push(att);
        }
    }
    out
}

fn truncate_message(msg: &str) -> String {
    let trimmed = msg.trim();
    if trimmed.chars().count() <= 2000 {
        trimmed.to_string()
    } else {
        trimmed.chars().take(2000).collect()
    }
}

fn apply_optional_content(mut builder: ExecuteWebhook, message: Option<&str>) -> ExecuteWebhook {
    if let Some(content) = message.filter(|m| !m.is_empty()) {
        builder = builder.content(content);
    }
    builder
}

async fn post_via_webhook(
    ctx: &Context,
    cmd: &CommandInteraction,
    paths: &[PathBuf],
    message: Option<&str>,
) -> anyhow::Result<()> {
    if cmd.guild_id.is_none() {
        anyhow::bail!("webhooks are not available in DMs");
    }

    let bot_user_id = ctx.cache.current_user().id;
    let (webhook_channel, thread_id) = webhook_channel_and_thread(cmd);
    let webhook = get_or_create_webhook(&ctx.http, webhook_channel, bot_user_id)
        .await
        .map_err(|e| anyhow::anyhow!("webhook setup failed: {e}"))?;

    let username = sanitize_webhook_username(&sender_display_name(cmd));
    let avatar_url = sender_avatar_url(cmd);
    let attachments = load_attachments(paths).await;
    if attachments.is_empty() {
        anyhow::bail!("no attachable files");
    }

    let mut builder = apply_optional_content(ExecuteWebhook::new(), message)
        .username(&username)
        .avatar_url(&avatar_url)
        .files(attachments);
    if let Some(thread) = thread_id {
        builder = builder.in_thread(thread);
    }

    match webhook.execute(&ctx.http, false, builder).await {
        Ok(_) => Ok(()),
        Err(first_err) => {
            tracing::warn!(
                "webhook execute with username failed ({first_err}); retrying without identity override"
            );
            let retry_attachments = load_attachments(paths).await;
            if retry_attachments.is_empty() {
                anyhow::bail!("webhook execute failed: {first_err}");
            }
            let mut retry = apply_optional_content(ExecuteWebhook::new(), message)
                .files(retry_attachments);
            if let Some(thread) = thread_id {
                retry = retry.in_thread(thread);
            }
            webhook
                .execute(&ctx.http, false, retry)
                .await
                .map(|_| ())
                .map_err(|e| anyhow::anyhow!("webhook execute failed: {e}"))
        }
    }
}

/// Posts files as the bot. Puts optional `message` on the first follow-up only.
async fn post_as_bot_followups(
    ctx: &Context,
    cmd: &CommandInteraction,
    paths: &[PathBuf],
    message: Option<&str>,
) {
    let mut first = true;
    for p in paths.iter().take(10) {
        if let Ok(att) = CreateAttachment::path(p).await {
            let mut followup = CreateInteractionResponseFollowup::new()
                .ephemeral(false)
                .add_file(att);
            if first {
                if let Some(content) = message.filter(|m| !m.is_empty()) {
                    followup = followup.content(content);
                }
                first = false;
            }
            let _ = cmd.create_followup(&ctx.http, followup).await;
        }
    }
}

async fn edit_status(ctx: &Context, cmd: &CommandInteraction, content: impl Into<String>) {
    let _ = cmd
        .edit_response(
            &ctx.http,
            EditInteractionResponse::new().content(content.into()),
        )
        .await;
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
                )
                .add_option(
                    CreateCommandOption::new(
                        CommandOptionType::String,
                        "message",
                        "Optional text to post with the media",
                    )
                    .required(false),
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
            let message = cmd
                .data
                .options
                .iter()
                .find(|o| o.name == "message")
                .and_then(|o| o.value.as_str())
                .map(truncate_message)
                .filter(|s| !s.is_empty());
            let message_ref = message.as_deref();

            let as_user = post_as_user_enabled(&self.db);
            if as_user {
                let _ = cmd.defer_ephemeral(&ctx.http).await;
            } else {
                let _ = cmd.defer(&ctx.http).await;
            }

            let tmp = tempfile::tempdir().ok();
            let Some(tmp) = tmp else {
                edit_status(&ctx, &cmd, "Failed to create temp dir").await;
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
                    if as_user {
                        match post_via_webhook(&ctx, &cmd, &paths, message_ref).await {
                            Ok(()) => {
                                edit_status(
                                    &ctx,
                                    &cmd,
                                    format!(
                                        "Posted {} file(s) from <{url}> as you",
                                        paths.len().min(10)
                                    ),
                                )
                                .await;
                            }
                            Err(e) => {
                                tracing::warn!("post-as-user failed ({e:#}); falling back to bot");
                                edit_status(
                                    &ctx,
                                    &cmd,
                                    format!(
                                        "Could not post as you ({e}); posting as bot instead"
                                    ),
                                )
                                .await;
                                post_as_bot_followups(&ctx, &cmd, &paths, message_ref).await;
                            }
                        }
                    } else {
                        // Public post: optional caption + files on the interaction response.
                        let attachments = load_attachments(&paths).await;
                        if attachments.is_empty() {
                            edit_status(&ctx, &cmd, "No attachable files").await;
                        } else {
                            let mut atts = EditAttachments::new();
                            for att in attachments {
                                atts = atts.add(att);
                            }
                            let mut edit = EditInteractionResponse::new().attachments(atts);
                            if let Some(content) = message_ref {
                                edit = edit.content(content);
                            }
                            if cmd.edit_response(&ctx.http, edit).await.is_err() {
                                post_as_bot_followups(&ctx, &cmd, &paths, message_ref).await;
                            }
                        }
                    }
                }
                Ok(_) => {
                    edit_status(&ctx, &cmd, "No files downloaded").await;
                }
                Err(e) => {
                    edit_status(&ctx, &cmd, format!("Download failed: {e}")).await;
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
