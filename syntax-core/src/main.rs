mod auth;
mod config;
mod db;
mod entitlement;
mod research;
mod llm;
mod llm_race;
mod loop_engine;
mod topic_guard;
mod validator;

#[cfg(test)]
mod test_factory;

use axum::{
    body::Bytes,
    extract::{Request, State},
    http::StatusCode,
    middleware,
    response::Sse,
    routing::{get, post},
    Router,
};
use chrono::Timelike;
use axum::response::sse::{Event, KeepAlive};
use futures::stream::StreamExt;
use std::pin::Pin;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tower_http::cors::CorsLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use uuid::Uuid;

use crate::auth::{auth_middleware, AuthState};
use crate::config::Config;
use crate::db::SupabaseClient;
use crate::llm::{AnthropicProvider, GeminiProvider, LlmRouter};
use crate::loop_engine::VerificationEngine;
use crate::validator::PortfolioConstraints;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockMemory {
    pub ticker: String,
    pub fact: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LivePrice {
    pub ticker: String,
    pub price: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct VerifyRequest {
    inquiry: String,
    portfolio_id: String,
    chat_history: Option<Vec<ChatMessage>>,
    stock_memories: Option<Vec<StockMemory>>,
    live_prices: Option<Vec<LivePrice>>,
}

#[derive(Debug, Serialize)]
struct VerifyResponse {
    message: String,
}

async fn health() -> &'static str {
    "ok"
}

#[derive(Clone)]
struct AppState {
    auth_state: AuthState,
    engine: Arc<VerificationEngine>,
    nano_engine: Arc<VerificationEngine>,
    db: Arc<SupabaseClient>,
}

// ──────────────────────────────────────────────────────────────────────────────
// Always-on autonomous research daemon
// ──────────────────────────────────────────────────────────────────────────────

/// Overnight deep analysis (markets closed, ~8 PM–6 AM ET)
const INQUIRIES_OVERNIGHT: &[&str] = &[
    "Perform a deep risk assessment and suggest overnight rebalancing moves",
    "Identify the weakest positions and recommend exit or reduce strategies",
    "Optimize allocation for maximum Sharpe ratio before market open",
    "What macro headwinds should I hedge against entering tomorrow",
    "Evaluate sector concentration and propose diversification targets",
    "Model a max-drawdown minimization scenario for my current holdings",
];

/// Pre-market preparation (6 AM–9:30 AM ET)
const INQUIRIES_PREMARKET: &[&str] = &[
    "Prepare a morning briefing: key risks and opportunities for today",
    "What positions should I size up or down at market open",
    "Identify any overnight news catalysts affecting my holdings",
    "Suggest a pre-market watchlist based on my current portfolio",
];

/// Market-hours tactical (9:30 AM–4 PM ET)
const INQUIRIES_MARKET: &[&str] = &[
    "What is the current optimal cash allocation given live conditions",
    "Identify any intraday rebalancing opportunities in my portfolio",
    "Which positions are showing elevated volatility risk right now",
    "Recommend a high-conviction tactical adjustment for today",
];

/// After-hours review (4 PM–8 PM ET)
const INQUIRIES_AFTERHOURS: &[&str] = &[
    "Review today's performance and suggest end-of-day rebalancing",
    "What positions should I hold overnight vs close before tomorrow",
    "Summarise key risk exposures heading into after-hours",
    "Recommend position sizing adjustments based on today's close",
];

/// Pick the right inquiry bank based on current UTC hour (approximate ET offset).
fn timezone_aware_inquiries(cycle: usize) -> &'static str {
    // ET = UTC-5 (standard) / UTC-4 (daylight). Use UTC-5 conservatively.
    let utc_hour = chrono::Utc::now().hour();
    // ET hour ≈ UTC − 5
    let et_hour = (utc_hour + 19) % 24; // +19 = -5 mod 24
    let bank: &[&str] = match et_hour {
        6..=9   => INQUIRIES_PREMARKET,
        10..=15 => INQUIRIES_MARKET,
        16..=19 => INQUIRIES_AFTERHOURS,
        _       => INQUIRIES_OVERNIGHT,
    };
    bank[cycle % bank.len()]
}

/// Spawn the always-on background daemon. Runs forever, queries all portfolios
/// from the DB each cycle, and paces itself to respect model quotas.
/// DAILY CREDIT CAP: $1.00 max (~44 experiments at current rates)
pub fn spawn_research_daemon(
    nano: Arc<crate::loop_engine::VerificationEngine>,
    db: Arc<crate::db::SupabaseClient>,
) {
    tokio::spawn(async move {
        tracing::info!("AutoResearch daemon starting (always-on, gemini-2.0-flash)");
        let mut cycle = 0usize;
        
        // Daily credit tracking
        let mut daily_cost_usd: f64 = 0.0;
        const DAILY_CAP_USD: f64 = 1.0; // $1.00 per day max
        const COST_PER_EXPERIMENT_USD: f64 = 0.0225; // ~3 attempts at $0.0075 each
        let mut last_reset_date = chrono::Utc::now().date_naive();
        
        loop {
            // Reset daily counter at midnight UTC
            let today = chrono::Utc::now().date_naive();
            if today != last_reset_date {
                tracing::info!("AutoResearch: Daily credit reset. Previous day spent: ${:.2}", daily_cost_usd);
                daily_cost_usd = 0.0;
                last_reset_date = today;
            }
            
            // Hard stop if daily cap reached
            if daily_cost_usd >= DAILY_CAP_USD {
                tracing::warn!("AutoResearch: Daily credit cap of ${} reached. Pausing until tomorrow.", DAILY_CAP_USD);
                // Sleep until next day (check every hour)
                tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await;
                continue;
            }

            // Refresh portfolio list every cycle
            let portfolio_ids = match db.list_portfolio_ids().await {
                Ok(ids) if !ids.is_empty() => ids,
                Ok(_) => {
                    tracing::debug!("AutoResearch: no portfolios yet, waiting 60s");
                    tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
                    continue;
                }
                Err(e) => {
                    tracing::warn!("AutoResearch: DB list failed: {}", e);
                    tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
                    continue;
                }
            };
            
            // Check if we can afford to process all portfolios this cycle
            let projected_cost = portfolio_ids.len() as f64 * COST_PER_EXPERIMENT_USD;
            if daily_cost_usd + projected_cost > DAILY_CAP_USD {
                let remaining_budget = DAILY_CAP_USD - daily_cost_usd;
                let affordable_count = (remaining_budget / COST_PER_EXPERIMENT_USD) as usize;
                if affordable_count == 0 {
                    tracing::warn!("AutoResearch: Insufficient budget for next portfolio. Daily spent: ${:.2}", daily_cost_usd);
                    tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await;
                    continue;
                }
                tracing::info!("AutoResearch: Budget limited - processing {} of {} portfolios this cycle", 
                    affordable_count, portfolio_ids.len());
                // Process only affordable_count portfolios
                let limited_ids: Vec<_> = portfolio_ids.into_iter().take(affordable_count).collect();
                process_portfolios(&nano, &db, &limited_ids, inquiry, &mut daily_cost_usd, COST_PER_EXPERIMENT_USD).await;
            } else {
                let inquiry = timezone_aware_inquiries(cycle);
                tracing::info!("AutoResearch cycle={} ({} portfolios): {} | Daily spent: ${:.2}/${:.2}", 
                    cycle, portfolio_ids.len(), inquiry, daily_cost_usd, DAILY_CAP_USD);
                process_portfolios(&nano, &db, &portfolio_ids, inquiry, &mut daily_cost_usd, COST_PER_EXPERIMENT_USD).await;
            }

            cycle = cycle.wrapping_add(1);
            // Inter-cycle pause: optimized for $1/day budget
            // 15 min during market hours, 30 min overnight
            let utc_hour = chrono::Utc::now().hour();
            let et_hour = (utc_hour + 19) % 24;
            let pause_secs = match et_hour {
                10..=15 => 900,  // market hours: every 15 min (~32 max per day)
                6..=9 | 16..=19 => 1200, // pre/post market: every 20 min
                _ => 1800, // overnight: every 30 min
            };
            tracing::debug!("AutoResearch cycle complete, next in {}s | Daily spent: ${:.2}/${:.2}", 
                pause_secs, daily_cost_usd, DAILY_CAP_USD);
            tokio::time::sleep(tokio::time::Duration::from_secs(pause_secs)).await;
        }
    });
}

async fn process_portfolios(
    nano: &Arc<crate::loop_engine::VerificationEngine>,
    db: &Arc<crate::db::SupabaseClient>,
    portfolio_ids: &[uuid::Uuid],
    inquiry: &str,
    daily_cost: &mut f64,
    cost_per_exp: f64,
) {
    for portfolio_id in portfolio_ids {
        let (tx, _rx) = tokio::sync::mpsc::channel(32);
        let outcome = nano.verify_trajectory_streaming(
            inquiry, *portfolio_id, None, None, None, tx, db.clone()
        ).await;
        
        // Track cost regardless of outcome
        *daily_cost += cost_per_exp;

        // Back off hard on rate-limit; keep same cycle index to retry
        if let crate::loop_engine::LoopOutcome::Terminated { ref reason, .. } = outcome {
            if reason.contains("429") || reason.contains("rate") || reason.contains("quota") {
                tracing::warn!("AutoResearch rate-limited — backing off 90s");
                tokio::time::sleep(tokio::time::Duration::from_secs(90)).await;
                continue;
            }
        }

        // Inter-portfolio pause to respect quota (longer to save costs)
        tokio::time::sleep(tokio::time::Duration::from_secs(15)).await;
    }
}

async fn autoresearch_stream_handler() -> Result<Sse<SseStream>, StatusCode> {
    let stream = async_stream::stream! {
        let mut byte_offset: u64 = 0;
        // First: send all existing log lines immediately
        if let Ok(content) = tokio::fs::read_to_string(crate::loop_engine::RESEARCH_LOG_PATH).await {
            byte_offset = content.len() as u64;
            for line in content.lines() {
                if !line.is_empty() {
                    yield Ok::<_, Infallible>(Event::default().data(line.to_string()));
                }
            }
        }
        // Then: poll for new lines every 500ms
        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            if let Ok(content) = tokio::fs::read_to_string(crate::loop_engine::RESEARCH_LOG_PATH).await {
                let content_len = content.len() as u64;
                if content_len > byte_offset {
                    let new_part = &content[byte_offset as usize..];
                    for line in new_part.lines() {
                        if !line.is_empty() {
                            yield Ok::<_, Infallible>(Event::default().data(line.to_string()));
                        }
                    }
                    byte_offset = content_len;
                }
            }
        }
    };
    Ok(Sse::new(Box::pin(stream) as SseStream).keep_alive(KeepAlive::default()))
}

type SseStream = Pin<Box<dyn futures::stream::Stream<Item = Result<Event, Infallible>> + Send>>;

async fn verify_handler(
    State(app_state): State<AppState>,
    req: Request,
) -> Result<Sse<SseStream>, StatusCode> {
    // Extract user_id from JWT claims
    let claims = req.extensions().get::<crate::auth::Claims>().cloned();
    let user_id = claims
        .and_then(|c| c.sub)
        .and_then(|s| Uuid::parse_str(&s).ok());

    let body_bytes: Bytes = axum::body::to_bytes(req.into_body(), 1024 * 1024)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let payload: VerifyRequest = serde_json::from_slice(&body_bytes)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let portfolio_id = Uuid::parse_str(&payload.portfolio_id)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let engine = app_state.engine.clone();
    let inquiry = payload.inquiry.clone();
    let chat_history = payload.chat_history.clone();
    let stock_memories = payload.stock_memories.clone();
    let live_prices = payload.live_prices.clone();
    let db = app_state.db.clone();

    // Tier is used both for credit gate and research logging
    let tier = if crate::llm_race::is_quality_tier(&inquiry) { "quality" } else { "race" };

    // Set to true when the user has exactly 1 free query remaining so we can warn them
    let mut last_free_query = false;

    // ── CREDIT GATE: Check free queries / credits BEFORE any LLM work ─────
    // This is the critical change from the spec - zero tokens if no entitlement
    if let Some(uid) = user_id {
        let http_client = reqwest::Client::new();

        match crate::entitlement::consume_query(
            &http_client,
            &uid.to_string(),
            1, // credits estimate
            tier,
            "pending",
            0,
            0,
            true,
        ).await {
            Ok(gate) if !gate.ok => {
                // No entitlement - return 402 before spending any LLM tokens
                let (tx, rx) = mpsc::channel(4);
                let _ = tx.send(crate::loop_engine::LoopEvent::UsageWarning {
                    warning_level: "blocked".to_string(),
                    current_cost_cents: 0,
                    limit_cents: 0,
                    message: "No credits remaining. Please add credits to continue.".to_string(),
                }).await;
                drop(tx);
                let stream: SseStream = Box::pin(ReceiverStream::new(rx).map(|event| {
                    let json = serde_json::to_string(&event).unwrap_or_default();
                    Ok::<_, Infallible>(Event::default().data(json))
                }));
                return Ok(Sse::new(stream).keep_alive(KeepAlive::default()));
            }
            Ok(gate) if gate.free_remaining == 1 => {
                tracing::info!("User {} has 1 free query remaining — will emit soft warning", user_id.map(|u| u.to_string()).unwrap_or_default());
                last_free_query = true;
            }
            Err(e) => {
                tracing::warn!("Failed to check credit entitlement: {}", e);
                // Proceed on error (fail open) - existing cost ceiling will catch issues
            }
            _ => {}
        }
    }

    // Pre-check cost ceiling (skip entirely in DEV_MODE)
    let dev_mode = std::env::var("DEV_MODE").unwrap_or_default() == "true";
    if !dev_mode {
    if let Some(uid) = user_id {
        if let Ok(status) = db.check_cost_ceiling(uid).await {
            if !status.allowed {
                let (tx, rx) = mpsc::channel(4);
                let _ = tx.send(crate::loop_engine::LoopEvent::UsageWarning {
                    warning_level: "blocked".to_string(),
                    current_cost_cents: status.current_cost_cents,
                    limit_cents: status.limit_cents,
                    message: "You've reached your usage limit for this billing period. Please upgrade your plan to continue.".to_string(),
                }).await;
                drop(tx);
                let stream: SseStream = Box::pin(ReceiverStream::new(rx).map(|event| {
                    let json = serde_json::to_string(&event).unwrap_or_default();
                    Ok::<_, Infallible>(Event::default().data(json))
                }));
                return Ok(Sse::new(stream).keep_alive(KeepAlive::default()));
            }
        }
    }
    } // end !dev_mode

    // Create a channel for progressive SSE streaming
    let (tx, rx) = mpsc::channel(32);
    let user_id_for_task = user_id;
    let db_for_cost = app_state.db.clone();
    let inquiry_for_log = inquiry.clone();
    let tier_for_log = tier.to_string();
    let verify_started_at = std::time::Instant::now();
    let last_free_for_task = last_free_query;

    // Spawn the verification engine task
    tokio::spawn(async move {
        // Emit soft warning if this is the user's last free query
        if last_free_for_task {
            let _ = tx.send(crate::loop_engine::LoopEvent::UsageWarning {
                warning_level: "soft".to_string(),
                current_cost_cents: 0,
                limit_cents: 0,
                message: "This is your last free query. Upgrade to OPERATOR to keep going.".to_string(),
            }).await;
        }

        let outcome = engine.verify_trajectory_streaming(&inquiry, portfolio_id, chat_history, stock_memories, live_prices, tx.clone(), db).await;

        // Research log — fire-and-forget, never blocks the response path
        if let Some(uid) = user_id_for_task {
            if let crate::loop_engine::LoopOutcome::Settled { ref projection, ref provider_used, .. } = outcome {
                let log_uid    = uid.to_string();
                let log_query  = inquiry_for_log.clone();
                let log_resp   = projection.reasoning.clone();
                let log_signal = research::detect_signal(&inquiry_for_log).to_string();
                let log_model  = provider_used.clone();
                let log_tier   = tier_for_log.clone();
                let log_score  = projection.confidence_score;
                let log_sharpe = projection.projected_sharpe;
                let log_dd     = projection.projected_max_drawdown;
                let log_ms     = verify_started_at.elapsed().as_millis() as i32;
                tokio::spawn(async move {
                    research::log_research(
                        &log_uid, &log_query, Some(&log_resp),
                        &log_signal, &log_model, &log_tier, 0,
                        Some(log_score), Some(log_sharpe), Some(log_dd), Some(log_ms),
                    ).await;
                });
            }
        }

        // Post-verification: update cost in DB and emit usage warning if needed
        if let Some(uid) = user_id_for_task {
            if let crate::loop_engine::LoopOutcome::Settled { cost_cents, .. } = &outcome {
                if let Err(e) = db_for_cost.add_verification_cost(uid, *cost_cents).await {
                    tracing::warn!("Failed to record verification cost: {}", e);
                }
                // Re-check ceiling after adding cost to emit warning
                if let Ok(status) = db_for_cost.check_cost_ceiling(uid).await {
                    if status.warning_level != "none" {
                        let msg = match status.warning_level.as_str() {
                            "urgent" => "You're approaching your usage limit. Consider upgrading to avoid interruption.".to_string(),
                            "soft" => "You've used over 75% of your usage allocation this period.".to_string(),
                            _ => String::new(),
                        };
                        if !msg.is_empty() {
                            let _ = tx.send(crate::loop_engine::LoopEvent::UsageWarning {
                                warning_level: status.warning_level,
                                current_cost_cents: status.current_cost_cents,
                                limit_cents: status.limit_cents,
                                message: msg,
                            }).await;
                        }
                    }
                }
            }
        }
    });

    let stream: SseStream = Box::pin(ReceiverStream::new(rx).map(|event| {
        let json = serde_json::to_string(&event).unwrap_or_default();
        Ok::<_, Infallible>(Event::default().data(json))
    }));

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "syntax_core=info,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    dotenvy::dotenv().ok();

    let config = Config::from_env().expect("Failed to load config");
    let auth_state = AuthState::new(config.supabase_jwt_secret.clone());

    // Use real API providers
    let anthropic_key = std::env::var("ANTHROPIC_API_KEY")
        .expect("ANTHROPIC_API_KEY must be set");
    let gemini_key = std::env::var("GEMINI_API_KEY")
        .expect("GEMINI_API_KEY must be set");

    let anthropic = Arc::new(AnthropicProvider::new(anthropic_key));
    let gemini = Arc::new(GeminiProvider::new(gemini_key.clone()));
    let router = Arc::new(LlmRouter::new(anthropic, gemini));
    let engine = Arc::new(VerificationEngine::new(
        router,
        PortfolioConstraints::default(),
        10,
    ));

    // Nano engine: Gemini primary (fast + cheap), Anthropic fallback for quota resilience
    let gemini_nano = Arc::new(GeminiProvider::new_with_model(
        gemini_key,
        "gemini-2.5-flash".to_string(),
    ));
    let anthropic_nano = Arc::new(AnthropicProvider::new(
        std::env::var("ANTHROPIC_API_KEY").expect("ANTHROPIC_API_KEY must be set"),
    ));
    let nano_router = Arc::new(LlmRouter::new(gemini_nano, anthropic_nano));
    let nano_engine = Arc::new(VerificationEngine::new(
        nano_router,
        PortfolioConstraints::default(),
        4,
    ));

    let db = Arc::new(SupabaseClient::new(
        &config.supabase_url,
        &config.supabase_service_role_key,
    ));

    let app_state = AppState {
        auth_state: auth_state.clone(),
        engine,
        nano_engine,
        db,
    };

    let cors = CorsLayer::permissive();

    // AutoResearch daemon is DISABLED by default — costs real money per cycle.
    // Enable explicitly via ENABLE_AUTORESEARCH=true when you want it running.
    if std::env::var("ENABLE_AUTORESEARCH").unwrap_or_default() == "true" {
        spawn_research_daemon(app_state.nano_engine.clone(), app_state.db.clone());
        tracing::info!("AutoResearch daemon ENABLED");
    } else {
        tracing::info!("AutoResearch daemon DISABLED (set ENABLE_AUTORESEARCH=true to enable)");
    }

    let protected_routes = Router::new()
        .route("/v1/verify", post(verify_handler))
        .route("/v1/autoresearch/stream", get(autoresearch_stream_handler))
        .route_layer(middleware::from_fn_with_state(
            auth_state.clone(),
            auth_middleware,
        ))
        .with_state(app_state);

    let app = Router::new()
        .route("/health", get(health))
        .merge(protected_routes)
        .layer(cors);

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind");

    tracing::info!("SYNTAX Core listening on {}", addr);

    axum::serve(listener, app)
        .await
        .expect("Server failed");
}
