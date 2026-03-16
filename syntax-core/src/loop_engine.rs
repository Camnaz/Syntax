use crate::llm::LlmRouter;
use crate::validator::{validate_trajectory, PortfolioConstraints, TrajectoryProjection};
use chrono::{DateTime, Utc, Datelike, Timelike, Weekday, TimeZone};

fn is_us_market_open(now: DateTime<Utc>) -> bool {
    // US Eastern Time is UTC-4 (EDT) or UTC-5 (EST)
    // For simplicity, we approximate using UTC hours (13:30 to 20:00 UTC is roughly 9:30 AM to 4:00 PM ET)
    if now.weekday() == Weekday::Sat || now.weekday() == Weekday::Sun {
        return false;
    }
    
    let hour = now.hour();
    let minute = now.minute();
    let time_in_minutes = hour * 60 + minute;
    
    // 13:30 UTC = 810 minutes, 20:00 UTC = 1200 minutes
    time_in_minutes >= 810 && time_in_minutes < 1200
}

fn classify_topic_locally(inquiry: &str) -> (bool, String) {
    let lower = inquiry.to_lowercase();
    const FINANCE_KEYWORDS: [&str; 54] = [
        "stock", "bond", "etf", "portfolio", "invest", "buy", "sell", "shares",
        "allocation", "market", "hedge", "risk", "return", "dividend", "yield",
        "rebalance", "capital", "profit", "loss", "p&l", "pnl", "options",
        "calls", "puts", "covered call", "strike", "expir", "volatil",
        "drawdown", "sharpe", "diversif", "sector", "ticker", "price",
        "earnings", "revenue", "valuation", "bull", "bear", "crash",
        "rally", "dip", "accumula", "position", "trade", "hold",
        "money", "dollar", "crypto", "bitcoin", "ethereum", "btc", "eth", "sol",
    ];

    if FINANCE_KEYWORDS.iter().any(|kw| lower.contains(kw)) {
        (true, "Matched financial keyword".to_string())
    } else {
        // Also check for common ticker patterns (1-5 uppercase letters)
        let has_ticker = inquiry.split_whitespace().any(|word| {
            word.len() >= 1 && word.len() <= 5 && word.chars().all(|c| c.is_ascii_uppercase())
        });
        if has_ticker {
            (true, "Matched ticker pattern".to_string())
        } else {
            (false, "No financial intent detected".to_string())
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
enum InquiryIntent {
    CapitalDeployment { amount: Option<f64> },
    Rebalance,
    Hedge,
    PositionAnalysis,
    GeneralAnalysis,
}

fn classify_inquiry_intent(inquiry: &str) -> InquiryIntent {
    let lower = inquiry.to_lowercase();

    // Capital deployment: "I have $500", "deploy $1000", "buy with $500"
    if lower.contains("$") || lower.contains("capital") || lower.contains("deploy") || lower.contains("put in") {
        let amount = inquiry.chars()
            .collect::<String>()
            .split('$')
            .nth(1)
            .and_then(|s| {
                s.chars()
                    .take_while(|c| c.is_ascii_digit() || *c == ',' || *c == '.')
                    .collect::<String>()
                    .replace(",", "")
                    .parse::<f64>()
                    .ok()
            });
        return InquiryIntent::CapitalDeployment { amount };
    }

    if lower.contains("hedge") || lower.contains("protect") || lower.contains("downside") || lower.contains("crash") || lower.contains("insurance") {
        return InquiryIntent::Hedge;
    }

    if lower.contains("rebalance") || lower.contains("re-balance") || lower.contains("redistribute") || lower.contains("adjust allocation") {
        return InquiryIntent::Rebalance;
    }

    if lower.contains("red flag") || lower.contains("review") || lower.contains("analyze") || lower.contains("how does") || lower.contains("what do you think") {
        return InquiryIntent::PositionAnalysis;
    }

    InquiryIntent::GeneralAnalysis
}

fn next_market_open(now: DateTime<Utc>) -> DateTime<Utc> {
    let mut next = now;
    // Add safety limit to prevent infinite loops/overflows
    for _ in 0..168 { // max 1 week (24 * 7 hours)
        next = next + chrono::Duration::hours(1);
        if next.hour() == 13 && next.minute() >= 30 && 
           next.weekday() != Weekday::Sat && next.weekday() != Weekday::Sun {
            if let Some(target) = Utc.with_ymd_and_hms(
                next.year(), next.month(), next.day(), 13, 30, 0
            ).single() {
                return target;
            }
        }
    }
    // Fallback to now if something goes wrong
    now
}
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;
use tokio::time::{timeout, Duration};
use uuid::Uuid;

const MAX_ATTEMPTS: usize = 3;
/// Hard per-attempt LLM timeout. Attempts exceeding this are cut and counted.
const ATTEMPT_TIMEOUT_SECS: u64 = 65;
/// After this many timeouts in one loop, bail early on best result and write incident.
const FAST_MODE_THRESHOLD: usize = 2;
pub const RESEARCH_LOG_PATH: &str = "research_log.txt";
pub const PERF_INCIDENT_PATH: &str = "SYNTAX_PERF_INCIDENT.md";

/// Global monotonic experiment counter — persists for the lifetime of the process.
static EXPERIMENT_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Read the last N non-empty lines from research_log.txt for learning context.
/// Returns empty string if file doesn't exist or is unreadable (non-fatal).
async fn read_recent_log_entries(n: usize) -> String {
    let content = match tokio::fs::read_to_string(RESEARCH_LOG_PATH).await {
        Ok(s) => s,
        Err(_) => return String::new(),
    };
    let lines: Vec<&str> = content
        .lines()
        .filter(|l| !l.trim().is_empty())
        .collect();
    let recent: Vec<&str> = lines.iter().rev().take(n).cloned().collect::<Vec<_>>();
    if recent.is_empty() {
        return String::new();
    }
    recent.into_iter().rev().collect::<Vec<_>>().join("\n")
}

/// Write a performance incident report for the autoresearcher to investigate.
async fn write_perf_incident(inquiry: &str, timeout_count: usize, last_attempt: usize) {
    let content = format!(
        "# SYNTAX Performance Incident\n\
        Timestamp: {}\n\
        Inquiry: {}\n\
        Timeouts: {}/{} attempts ({}s limit each)\n\
        \n\
        ## Autoresearcher Investigation Task\n\
        The verification loop timed out {} time(s). Investigate and propose fixes for:\n\
        1. System prompt length (RECENT_VERIFICATION_PATTERNS section — reduce from 8 to 3 entries)\n\
        2. Gemini grounding latency — consider disabling for simple queries\n\
        3. Consider reducing MAX_ATTEMPTS from 5 to 3 for faster loops\n\
        4. Add streaming token-level response to surface partial results sooner\n\
        5. Provider-specific timeout tuning (Gemini grounding vs Anthropic)\n\
        \n\
        STATUS: NEEDS_INVESTIGATION\n\
        Generated: {}\n",
        Utc::now().format("%Y-%m-%dT%H:%M:%SZ"),
        &inquiry[..inquiry.len().min(120)],
        timeout_count, last_attempt, ATTEMPT_TIMEOUT_SECS,
        timeout_count,
        Utc::now().format("%Y-%m-%dT%H:%M:%SZ"),
    );
    if let Ok(mut f) = tokio::fs::OpenOptions::new()
        .create(true).write(true).truncate(true)
        .open(PERF_INCIDENT_PATH).await
    {
        let _ = f.write_all(content.as_bytes()).await;
    }
    tracing::warn!("Performance incident written: {} timeouts on attempt {}", timeout_count, last_attempt);
}

async fn append_research_log(inquiry: &str, best_score: f64, best_attempt: usize, proj: &TrajectoryProjection) {
    let exp = EXPERIMENT_COUNTER.fetch_add(1, Ordering::Relaxed);
    // Strip injected news/memory prefixes so we log the actual user question
    let clean_inquiry = if let Some(pos) = inquiry.find("]\n\n") {
        inquiry[pos + 3..].trim()
    } else {
        inquiry.trim()
    };
    let line = format!(
        "[{}] exp={:04} score={:.4} sharpe={:.2} dd={:.1}% conf={:.0}% attempts={} | {}\n",
        Utc::now().format("%Y-%m-%dT%H:%M:%SZ"),
        exp,
        best_score,
        proj.projected_sharpe,
        proj.projected_max_drawdown * 100.0,
        proj.confidence_score * 100.0,
        best_attempt,
        &clean_inquiry[..clean_inquiry.len().min(100)],
    );
    if let Ok(mut f) = tokio::fs::OpenOptions::new()
        .create(true).append(true).open(RESEARCH_LOG_PATH).await
    {
        let _ = f.write_all(line.as_bytes()).await;
    }
}

/// Composite fitness score for a projection (higher = better).
/// Mirrors the autoresearch-macos `val_bpb` concept: a single scalar
/// that captures projection quality so the loop can keep the best candidate.
/// Score = (sharpe / (1 + drawdown×10)) × confidence
fn score_projection(p: &TrajectoryProjection) -> f64 {
    let sharpe = p.projected_sharpe.max(0.0);
    let drawdown = p.projected_max_drawdown.clamp(0.0, 1.0);
    let confidence = p.confidence_score.clamp(0.0, 1.0);
    (sharpe / (1.0 + drawdown * 10.0)) * confidence
}

/// Estimate LLM cost in cents based on provider and token counts.
/// Gemini 2.5 Flash: $0.15/1M input, $0.60/1M output
/// Anthropic Claude Sonnet: $3.00/1M input, $15.00/1M output
fn estimate_cost_cents(provider: &str, input_tokens: u32, output_tokens: u32) -> i32 {
    let cost_microdollars = match provider {
        "gemini" => {
            (input_tokens as f64 * 0.15 / 1_000.0) + (output_tokens as f64 * 0.60 / 1_000.0)
        }
        "anthropic" | _ => {
            (input_tokens as f64 * 3.0 / 1_000.0) + (output_tokens as f64 * 15.0 / 1_000.0)
        }
    };
    // Convert microdollars to cents, rounding up to ensure we never undercount
    (cost_microdollars / 10.0).ceil() as i32
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", content = "data")]
pub enum LoopEvent {
    TopicCheck {
        is_financial: bool,
        reason: String,
    },
    Attempt {
        number: usize,
        provider: String,
    },
    Rejected {
        attempt: usize,
        reason: String,
    },
    Verified {
        attempt: usize,
        projection: TrajectoryProjection,
        score: f64,
        is_new_best: bool,
        sharpe: f64,
        drawdown: f64,
        confidence: f64,
    },
    Settled {
        total_attempts: usize,
        final_projection: TrajectoryProjection,
    },
    Terminated {
        total_attempts: usize,
        reason: String,
    },
    Error {
        message: String,
    },
    /// Emitted when an attempt exceeds the hard timeout and is abandoned.
    Slow {
        attempt: usize,
        timeout_secs: u64,
    },
    UsageWarning {
        warning_level: String,
        current_cost_cents: i32,
        limit_cents: i32,
        message: String,
    },
    NeedsTopup {
        status: String,
        reason: String,
    },
}

#[derive(Debug)]
pub enum LoopOutcome {
    Settled {
        attempts: usize,
        projection: TrajectoryProjection,
        provider_used: String,
        cost_cents: i32,
    },
    Terminated {
        attempts: usize,
        reason: String,
    },
    TopicRejected {
        reason: String,
    },
}

pub struct VerificationEngine {
    llm_router: Arc<LlmRouter>,
    constraints: PortfolioConstraints,
    semaphore: Arc<Semaphore>,
}

impl VerificationEngine {
    pub fn new(
        llm_router: Arc<LlmRouter>,
        constraints: PortfolioConstraints,
        max_concurrent: usize,
    ) -> Self {
        Self {
            llm_router,
            constraints,
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
        }
    }

    pub async fn verify_trajectory_streaming(
        &self,
        inquiry: &str,
        portfolio_id: Uuid,
        chat_history: Option<Vec<crate::ChatMessage>>,
        stock_memories: Option<Vec<crate::StockMemory>>,
        live_prices: Option<Vec<crate::LivePrice>>,
        tx: tokio::sync::mpsc::Sender<LoopEvent>,
        db: Arc<crate::db::SupabaseClient>,
    ) -> LoopOutcome {
        // Acquire semaphore permit
        let _permit = self.semaphore.acquire().await.unwrap();

        // Step 1: Topic guard (local heuristic)
        let (is_financial, reason) = classify_topic_locally(inquiry);

        let _ = tx.send(LoopEvent::TopicCheck {
            is_financial,
            reason: reason.clone(),
        }).await;

        if !is_financial {
            return LoopOutcome::TopicRejected { reason };
        }

        // Fetch portfolio context from database
        let portfolio_config = match db.get_portfolio(portfolio_id).await {
            Ok(cfg) => {
                tracing::info!("Portfolio config loaded: {}", if cfg.is_some() { "found" } else { "not found" });
                cfg
            }
            Err(e) => {
                tracing::warn!("Portfolio fetch failed (portfolio_id={}): {}", portfolio_id, e);
                None
            }
        };
        let positions = match db.get_positions(portfolio_id).await {
            Ok(pos) => {
                tracing::info!("Positions loaded: {} positions for portfolio {}", pos.len(), portfolio_id);
                Some(pos)
            }
            Err(e) => {
                tracing::warn!("Positions fetch failed (portfolio_id={}): {}", portfolio_id, e);
                None
            }
        };

        // Step 2: Classify inquiry intent for research-directed prompting
        let intent = classify_inquiry_intent(inquiry);
        tracing::info!("Classified inquiry intent: {:?}", intent);

        // Step 2b: Load recent successful verification patterns for self-improvement
        let recent_learnings = read_recent_log_entries(3).await;

        // Step 3: Verification loop with error injection and progressive refinement
        let mut error_history: Vec<String> = Vec::new();
        let mut previous_response: Option<String> = None;
        let mut cumulative_cost_cents: i32 = 0;
        let mut timeout_count: usize = 0;

        // autoresearch-style: track the best-scoring valid projection across all attempts
        let mut best_projection: Option<TrajectoryProjection> = None;
        let mut best_score: f64 = f64::NEG_INFINITY;
        let mut best_attempt: usize = 0;
        let mut best_provider: String = String::new();
        
        for attempt in 1..=MAX_ATTEMPTS {
            let _ = tx.send(LoopEvent::Attempt {
                number: attempt,
                provider: "pending".to_string(),
            }).await;

            let system_prompt = self.build_system_prompt(attempt, portfolio_config.as_ref(), &intent, &recent_learnings);
            let user_prompt = self.build_user_prompt_with_errors(
                inquiry, 
                portfolio_id, 
                &error_history, 
                &chat_history,
                stock_memories.as_ref(),
                portfolio_config.as_ref(),
                positions.as_ref(),
                live_prices.as_ref(),
                previous_response.as_deref(),
            );

            tracing::info!("Attempt {}/{}: sending to LLM (intent={:?}, errors={})", 
                attempt, MAX_ATTEMPTS, intent, error_history.len());

            let attempt_start = std::time::Instant::now();
            let llm_result = timeout(
                Duration::from_secs(ATTEMPT_TIMEOUT_SECS),
                self.llm_router.complete(&system_prompt, &user_prompt),
            ).await;

            let attempt_ms = attempt_start.elapsed().as_millis();
            let (response, provider) = match llm_result {
                Ok(Ok(r)) => {
                    tracing::info!("Attempt {} completed in {}ms (provider: {})", attempt, attempt_ms, r.1);
                    r
                }
                Ok(Err(e)) => {
                    // Circuit breaker: if credits exhausted, emit NeedsTopup and stop the loop
                    if e.is_credits_exhausted() {
                        tracing::warn!("Credits exhausted — triggering Financial Bridge: {}", e);
                        let _ = tx.send(LoopEvent::NeedsTopup {
                            status: "needs_topup".to_string(),
                            reason: "credits_exhausted".to_string(),
                        }).await;
                        break;
                    }
                    let error_msg = format!("LLM request failed: {}", e);
                    let _ = tx.send(LoopEvent::Error {
                        message: error_msg.clone(),
                    }).await;
                    error_history.push(error_msg);
                    continue;
                }
                Err(_elapsed) => {
                    timeout_count += 1;
                    tracing::warn!("Attempt {} timed out after {}s (total timeouts: {})",
                        attempt, ATTEMPT_TIMEOUT_SECS, timeout_count);
                    let _ = tx.send(LoopEvent::Slow {
                        attempt,
                        timeout_secs: ATTEMPT_TIMEOUT_SECS,
                    }).await;
                    // Fast-mode: if >= threshold timeouts and we have a valid result, bail early
                    if timeout_count >= FAST_MODE_THRESHOLD {
                        write_perf_incident(inquiry, timeout_count, attempt).await;
                        if let Some(proj) = best_projection {
                            tracing::info!("Fast-mode bail: returning best of {} attempts after {} timeouts",
                                best_attempt, timeout_count);
                            append_research_log(inquiry, best_score, best_attempt, &proj).await;
                            let _ = tx.send(LoopEvent::Settled {
                                total_attempts: attempt,
                                final_projection: proj.clone(),
                            }).await;
                            return LoopOutcome::Settled {
                                attempts: attempt,
                                projection: proj,
                                provider_used: best_provider,
                                cost_cents: cumulative_cost_cents,
                            };
                        }
                    }
                    continue;
                }
            };

            // Track cost for this LLM call
            let call_cost = estimate_cost_cents(provider, response.input_tokens_estimate, response.output_tokens_estimate);
            cumulative_cost_cents += call_cost;
            tracing::info!("LLM call cost: {} cents (cumulative: {} cents, provider: {})", 
                call_cost, cumulative_cost_cents, provider);

            // Store response for progressive refinement on next attempt
            if !response.text_with_citations().is_empty() {
                previous_response = Some(response.text_with_citations().clone());
            }

            // Update the attempt event with the actual provider
            let _ = tx.send(LoopEvent::Attempt {
                number: attempt,
                provider: provider.to_string(),
            }).await;

            // Handle any tool calls requested by the LLM (legacy direct updates, converting to pending actions in prompt but keep handler for safety)
            let mut extracted_pending_actions: Vec<crate::llm::tools::portfolio::PendingAction> = Vec::new();
            
            for call in &response.tool_calls {
                if call.name == "upsert_portfolio_position" {
                    #[derive(Deserialize)]
                    struct UpsertArgs {
                        ticker: String,
                        shares: Option<f64>,
                        average_purchase_price: Option<f64>,
                    }
                    if let Ok(args) = serde_json::from_value::<UpsertArgs>(call.arguments.clone()) {
                        tracing::info!("Tool call: upsert_portfolio_position({}, shares={:?}, price={:?})", 
                            args.ticker, args.shares, args.average_purchase_price);
                        
                        extracted_pending_actions.push(crate::llm::tools::portfolio::PendingAction {
                            id: uuid::Uuid::new_v4().to_string(),
                            action_type: "update_position".to_string(),
                            description: format!("Update position for {} to {:?} shares", args.ticker, args.shares),
                            data: serde_json::json!({
                                "ticker": args.ticker,
                                "shares": args.shares,
                                "average_purchase_price": args.average_purchase_price
                            }),
                        });
                    }
                } else if call.name == "propose_portfolio_actions" {
                    #[derive(Deserialize)]
                    struct ProposeArgs {
                        actions: Vec<crate::llm::tools::portfolio::PendingAction>,
                    }
                    match serde_json::from_value::<ProposeArgs>(call.arguments.clone()) {
                        Ok(args) => {
                            for mut action in args.actions {
                                action.id = uuid::Uuid::new_v4().to_string();
                                extracted_pending_actions.push(action);
                            }
                        }
                        Err(e) => {
                            tracing::error!("Failed to parse propose_portfolio_actions tool call: {} (args: {})", e, call.arguments);
                            let error_msg = format!("Tool call parsing failed: {}", e);
                            error_history.push(error_msg.clone());
                            let _ = tx.send(LoopEvent::Rejected {
                                attempt,
                                reason: error_msg,
                            }).await;
                            continue; // Skip trying to parse empty text
                        }
                    }
                }
            }

            // If we only got tool calls and no text, we still need to return a trajectory with these actions so the UI can show them
            if !extracted_pending_actions.is_empty() {
                let reasoning = if response.text_with_citations().trim().is_empty() {
                    "I've prepared the following portfolio updates for you to review.".to_string()
                } else {
                    // Try to extract reasoning if it returned a JSON projection alongside the tool call
                    match self.parse_projection(&response.text_with_citations(), portfolio_id) {
                        Ok(p) => p.reasoning,
                        Err(_) => response.text_with_citations().trim().to_string(),
                    }
                };

                let tool_projection = TrajectoryProjection {
                    portfolio_id,
                    timestamp: Utc::now(),
                    proposed_allocation: vec![],
                    projected_sharpe: 0.0,
                    projected_max_drawdown: 0.0,
                    confidence_score: 1.0,
                    scenario_chart: None,
                    pending_actions: Some(extracted_pending_actions),
                    reasoning,
                };
                
                let _ = tx.send(LoopEvent::Settled {
                    total_attempts: attempt,
                    final_projection: tool_projection.clone(),
                }).await;
                
                return LoopOutcome::Settled {
                    attempts: attempt,
                    projection: tool_projection,
                    provider_used: provider.to_string(),
                    cost_cents: cumulative_cost_cents,
                };
            }

            if response.text_with_citations().trim().is_empty() {
                // LLM returned empty text and no valid tool calls
                let error_msg = "LLM returned empty response without valid tool calls.".to_string();
                tracing::warn!("{}", error_msg);
                let _ = tx.send(LoopEvent::Rejected {
                    attempt,
                    reason: error_msg.clone(),
                }).await;
                error_history.push(error_msg);
                continue;
            }

            // Parse the LLM response into a TrajectoryProjection
            let mut projection = match self.parse_projection(&response.text_with_citations(), portfolio_id) {
                Ok(p) => p,
                Err(e) => {
                    let error_msg = format!(
                        "Parse error on attempt {}: {}. Response must be ONLY valid JSON — no markdown, no text before/after.",
                        attempt, e
                    );
                    tracing::warn!("Parse failed: {}. Response preview: {}", e, 
                        &response.text_with_citations()[..response.text_with_citations().len().min(200)]);
                    let _ = tx.send(LoopEvent::Rejected {
                        attempt,
                        reason: error_msg.clone(),
                    }).await;
                    error_history.push(error_msg);
                    continue;
                }
            };

            // Validate against constraints
            match validate_trajectory(&mut projection, &self.constraints).await {
                Ok(_) => {
                    let score = score_projection(&projection);
                    let is_new_best = score > best_score;

                    tracing::info!("Attempt {} score={:.4} (Sharpe={:.2}, drawdown={:.2}%, confidence={:.0}%) {}",
                        attempt, score,
                        projection.projected_sharpe, 
                        projection.projected_max_drawdown * 100.0,
                        projection.confidence_score * 100.0,
                        if is_new_best { "← NEW BEST" } else { "" });

                    let _ = tx.send(LoopEvent::Verified {
                        attempt,
                        projection: projection.clone(),
                        score,
                        is_new_best,
                        sharpe: projection.projected_sharpe,
                        drawdown: projection.projected_max_drawdown,
                        confidence: projection.confidence_score,
                    }).await;

                    if is_new_best {
                        best_score = score;
                        best_attempt = attempt;
                        best_provider = provider.to_string();
                        best_projection = Some(projection.clone());
                    }

                    // Inject "beat this" challenge so next attempt tries to improve
                    if attempt < MAX_ATTEMPTS {
                        error_history.push(format!(
                            "OPTIMIZATION PASS {}/{}: Your last valid response scored {:.4} \
                            (Sharpe={:.2}, max drawdown={:.1}%, confidence={:.0}%). \
                            Generate a DIFFERENT allocation that improves this score. \
                            Higher Sharpe, lower drawdown, and higher confidence all count. \
                            Do not repeat the same weights — try a genuinely better allocation strategy.",
                            attempt, MAX_ATTEMPTS, score,
                            projection.projected_sharpe,
                            projection.projected_max_drawdown * 100.0,
                            projection.confidence_score * 100.0
                        ));
                    }
                }
                Err(e) => {
                    let error_msg = self.build_constraint_error_message(&e.to_string(), &projection);
                    tracing::info!("Attempt {} rejected: {}", attempt, error_msg);
                    let _ = tx.send(LoopEvent::Rejected {
                        attempt,
                        reason: error_msg.clone(),
                    }).await;
                    error_history.push(error_msg);
                }
            }
        }

        // All attempts exhausted — return best valid projection if one was found
        if let Some(proj) = best_projection {
            tracing::info!("Auto-research loop complete: best was attempt {} (score={:.4})", best_attempt, best_score);
            append_research_log(inquiry, best_score, best_attempt, &proj).await;
            let _ = tx.send(LoopEvent::Settled {
                total_attempts: MAX_ATTEMPTS,
                final_projection: proj.clone(),
            }).await;
            return LoopOutcome::Settled {
                attempts: best_attempt,
                projection: proj,
                provider_used: best_provider,
                cost_cents: cumulative_cost_cents,
            };
        }

        let _ = tx.send(LoopEvent::Terminated {
            total_attempts: MAX_ATTEMPTS,
            reason: "Maximum attempts reached without valid projection".to_string(),
        }).await;

        LoopOutcome::Terminated {
            attempts: MAX_ATTEMPTS,
            reason: "Max attempts exceeded".to_string(),
        }
    }

    fn build_system_prompt(&self, attempt: usize, portfolio_config: Option<&crate::db::Portfolio>, intent: &InquiryIntent, recent_learnings: &str) -> String {
        let max_drawdown = portfolio_config.map(|c| c.max_drawdown_limit).unwrap_or(self.constraints.max_drawdown_pct);
        let min_sharpe = portfolio_config.map(|c| c.min_sharpe_ratio).unwrap_or(self.constraints.min_sharpe_ratio);
        let max_position = portfolio_config.map(|c| c.max_position_size).unwrap_or(self.constraints.max_position_size_pct);

        let now = Utc::now();
        let is_market_open = is_us_market_open(now);
        let market_status = if is_market_open { "OPEN" } else { "CLOSED" };
        let next_open = next_market_open(now);

        // Intent-specific research directives (autoresearch pattern: program.md equivalent)
        let intent_directive = match intent {
            InquiryIntent::CapitalDeployment { amount } => {
                let amt_str = amount.map(|a| format!("${:.2}", a)).unwrap_or_else(|| "the specified amount".to_string());
                format!(
                    r#"MISSION: CAPITAL DEPLOYMENT RESEARCH
The user wants to deploy {} into the market. Your job is to be their research analyst.

RESEARCH PROTOCOL:
1. SCAN current market conditions — what sectors are showing momentum? What's beaten down but has catalysts?
2. ANALYZE the user's existing positions — where are they over/underweight? What gaps exist?
3. RECOMMEND specific trades — not generic ETFs unless appropriate. Give them actionable ticker + reasoning.
4. CALCULATE how the new capital changes their overall allocation and risk profile.
5. TIMING — if market is closed, recommend limit orders with specific price levels for market open.

Think like a portfolio manager deploying capital for a client, not a textbook giving generic advice."#,
                    amt_str
                )
            },
            InquiryIntent::Hedge => {
                r#"MISSION: HEDGE ANALYSIS & DOWNSIDE PROTECTION
The user is concerned about downside risk. Research and recommend specific hedging strategies.

RESEARCH PROTOCOL:
1. ANALYZE the user's current positions — what is their actual exposure? Which positions carry the most risk?
2. RESEARCH current volatility environment — VIX levels, put/call ratios, credit spreads.
3. RECOMMEND specific hedges — put options, inverse ETFs, collar strategies, or reallocation.
4. QUANTIFY the cost of protection vs. the downside it covers.
5. CONSIDER the user might have intentional concentrated positions (accumulating for covered calls, etc.) — ask about intent rather than assuming it's wrong.

Be specific. "Buy protective puts" is useless. "Buy SPY 450P expiring June for ~$3.50/contract" is actionable."#.to_string()
            },
            InquiryIntent::Rebalance => {
                r#"MISSION: PORTFOLIO REBALANCING OPTIMIZATION
The user wants to rebalance. Your job is to find the optimal adjustment path.

RESEARCH PROTOCOL:
1. MAP current allocation vs. target — where are the drifts? Which positions are overweight/underweight?
2. RESEARCH tax implications — which lots to sell, wash sale considerations.
3. MINIMIZE transaction costs — what's the smallest number of trades to achieve target allocation?
4. CONSIDER momentum — don't blindly sell winners. A position may be overweight because it's working.
5. RECOMMEND specific trades in priority order — what to sell first, what to buy, and at what amounts.

If positions violate constraints, ASK the user why before recommending changes. There may be intentional reasons like:
- Accumulating shares to reach 100 for covered calls
- Cost-averaging into a position during a dip
- Concentrated bet based on fundamental thesis"#.to_string()
            },
            InquiryIntent::PositionAnalysis => {
                r#"MISSION: PORTFOLIO HEALTH CHECK & POSITION ANALYSIS
The user wants you to review their current holdings and identify issues or opportunities.

RESEARCH PROTOCOL:
1. ANALYZE each position — fundamentals, recent earnings, analyst ratings, momentum.
2. IDENTIFY correlations — are positions too correlated? Hidden sector concentration?
3. FLAG risks — but DON'T assume concentrated positions are mistakes. ASK why:
   - "I notice BGS is 60% of your portfolio. Is this intentional? Are you accumulating for covered calls, or would you like to diversify?"
   - "Your tech exposure is 80%. Is this a conviction play or would you like to reduce?"
4. SURFACE opportunities — what's the market giving you right now that complements their portfolio?
5. SCORE the overall portfolio — risk-adjusted return potential, diversification score, income potential."#.to_string()
            },
            InquiryIntent::GeneralAnalysis => {
                r#"MISSION: COMPREHENSIVE PORTFOLIO ANALYSIS
Provide thorough analysis tailored to the user's specific question and portfolio.

RESEARCH PROTOCOL:
1. UNDERSTAND the user's question in the context of their actual holdings.
2. RESEARCH current market conditions relevant to their positions.
3. PROVIDE specific, actionable recommendations — not generic platitudes.
4. CITE data and sources when making claims about market conditions.
5. If positions violate constraints, ASK why rather than immediately suggesting changes."#.to_string()
            },
        };

        let refinement_note = if attempt > 1 {
            format!(
                r#"

REFINEMENT ITERATION {attempt}/3:
Your previous response was rejected. Study the errors below carefully.
This is NOT just about fixing numbers — improve your REASONING and RESEARCH quality.
Each iteration should demonstrate deeper analysis, not just adjusted values.
Hard constraints: max drawdown ≤ {:.0}%, min Sharpe ≥ {:.2}, max position ≤ {:.0}%, min confidence ≥ {:.0}%."#,
                max_drawdown * 100.0,
                min_sharpe,
                max_position * 100.0,
                self.constraints.min_confidence_score * 100.0
            )
        } else {
            String::new()
        };

        let learnings_block = if recent_learnings.is_empty() {
            String::new()
        } else {
            format!(
                "\nRECENT VERIFICATION PATTERNS (learn from these — what scored well and why):\n{}\n",
                recent_learnings
            )
        };

        format!(
            r#"You are SYNTAX — an elite AI portfolio analyst that combines real-time research with rigorous risk management. You think like a hedge fund PM, not a robo-advisor.{learnings_block}

MARKET CONTEXT:
- Current UTC Time: {time}
- US Market Status: {status}
- Next Market Open (UTC): {next}

{intent}

RESPONSE FORMAT — TWO PATHS (choose the correct one):

## PATH A: Direct Portfolio Updates (add/buy/sell/remove specific positions)
If the user is requesting to ADD, BUY, SELL, REMOVE, or UPDATE a specific stock position (including "add $500 of BGS" or "buy $1000 worth of AAPL"):
- **ONLY use the `propose_portfolio_actions` tool call. Do NOT return any JSON text.**
- Do NOT calculate a full rebalancing. Do NOT suggest selling other positions unless the user explicitly asked to rebalance.
- Do NOT return a JSON projection object.
- Propose ONLY the exact action the user asked for.
- **CRITICAL: If the user specifies a dollar amount (e.g., "$500 of BGS"), you MUST ask for their average purchase price per share** — you cannot calculate shares without knowing what price they paid.
- **Confirm the ticker matches the company name** — if user says "BGS", confirm it refers to the correct company (e.g., "Do you mean BGS — B&G Foods?").
- **DO NOT provide long-winded analysis** — just ask for missing info (avg price) and confirm the action.

## PATH B: Analysis & Projections (research, what-if, rebalancing analysis)
If the user is asking for analysis, research, projections, or explicitly wants to rebalance (even a simple conversational question):
- Return ONLY valid JSON (no markdown code blocks, no text before/after):
{{
  "proposed_allocation": [
    {{"ticker": "SYMBOL", "weight": 0.XX}}
  ],
  "projected_sharpe": X.XX,
  "projected_max_drawdown": 0.XX,
  "confidence_score": 0.XX,
  "scenario_chart": {{
    "enabled": true/false,
    "initial_capital": X,
    "time_horizon_days": X,
    "bull_annual_return": 0.XX,
    "base_annual_return": 0.XX,
    "bear_annual_return": 0.XX,
    "volatility": 0.XX,
    "dca_monthly_amount": X,
    "suggested_sell_points": [X, X]
  }},
  "reasoning": "Rich Markdown-formatted analysis. Put your entire conversational response here. Use ## headings, **bold**, bullet points. Cite sources with [Name](url). Be specific and actionable. If a position appears to violate constraints, ask the user WHY rather than assuming it's wrong."
}}

CRITICAL: EVEN FOR SIMPLE CONVERSATIONAL QUESTIONS, YOU MUST RETURN THE JSON OBJECT ABOVE. Put your conversational answer in the `reasoning` field. Do NOT return plain text.

## CRITICAL TRADE QUANTITY RULES (violations are logical errors, not just constraint failures):
- **NEVER suggest selling more shares than the user currently owns.** Cross-check EVERY sell quantity against the exact share count in CURRENT PORTFOLIO HOLDINGS.
- If user has 119.575 BSG shares, you CANNOT suggest selling 230 BSG shares. That is physically impossible.
- When proposing any sell trade, the sell quantity MUST be ≤ the current share count from CURRENT PORTFOLIO HOLDINGS.
- `proposed_allocation` weights must reflect the CURRENT portfolio + only the REQUESTED change, not an imagined reallocation from scratch.

CAPABILITIES:
- RISK PROFILE: If user expresses risk appetite, suggest specific parameter changes and ask to confirm.
- PORTFOLIO UPDATES: Parse exact tickers/shares/costs. Use `propose_portfolio_actions` tool with ALL actions in one call. Confirm before executing. Preserve fractional shares and exact costs.
- SCENARIO ENGINE: For "what to buy with $X" — ask timeline + DCA intent, show real dollar amounts and share counts, populate `scenario_chart` JSON, compare alternatives.
- NEWS IMPACT: Analyze per-position impact with severity and specific price estimates.
- CORRECTIONS: Fact-check user corrections before accepting. Emit <!--MEMORY_SAVE ticker="X" fact="Y" source="verified"--> for verified facts. Use [STOCK MEMORIES] context when provided.
- DEEP RESEARCH: For urgent queries, cite current price, 52-week range, analyst targets, broad market context. Recommend specific order types if broker mentioned.

HARD CONSTRAINTS (violations = rejection):
- Weights sum ≤ 1.0, max_drawdown ≤ {max_dd:.2}, sharpe ≥ {min_sr:.2}, max position ≤ {max_pos:.2}, confidence ∈ [{min_conf:.2}, 1.0], US-listed only
- NEVER sell more shares than user owns. Cross-check every sell qty against current holdings.

RULES:
- Never fabricate data. Cite sources with [Name](url). Ground claims in verifiable metrics.
- Cross-reference recommendations against existing holdings. If allocation looks unusual, ASK why.
- Response validated against constraints; if rejected you retry with deeper analysis.{refinement}"#,
            time = now.to_rfc3339(),
            status = market_status,
            next = next_open.to_rfc3339(),
            intent = intent_directive,
            max_dd = max_drawdown,
            min_sr = min_sharpe,
            max_pos = max_position,
            min_conf = self.constraints.min_confidence_score,
            refinement = refinement_note
        )
    }

    fn build_user_prompt(&self, inquiry: &str, portfolio_id: Uuid) -> String {
        format!(
            "Portfolio ID: {}\n\nUser Inquiry: {}\n\nProvide your analysis as a JSON projection.",
            portfolio_id, inquiry
        )
    }

    fn build_user_prompt_with_errors(
        &self,
        inquiry: &str,
        portfolio_id: Uuid,
        error_history: &[String],
        chat_history: &Option<Vec<crate::ChatMessage>>,
        stock_memories: Option<&Vec<crate::StockMemory>>,
        portfolio_config: Option<&crate::db::Portfolio>,
        positions: Option<&Vec<crate::db::Position>>,
        live_prices: Option<&Vec<crate::LivePrice>>,
        previous_response: Option<&str>,
    ) -> String {
        let mut prompt = format!("Portfolio ID: {}\n\n", portfolio_id);

        if let Some(memories) = stock_memories {
            if !memories.is_empty() {
                prompt.push_str("[STOCK MEMORIES — verified facts that override defaults:]\n");
                for memory in memories {
                    prompt.push_str(&format!("{}: {}\n", memory.ticker, memory.fact));
                }
                prompt.push_str("\n");
            }
        }

        // Build a quick lookup map for live prices
        let price_map: std::collections::HashMap<String, f64> = live_prices
            .map(|lp| lp.iter().map(|p| (p.ticker.to_uppercase(), p.price)).collect())
            .unwrap_or_default();

        // Calculate actual portfolio value from positions
        let mut total_position_value = 0.0;
        let mut _has_positions = false;
        
        if let Some(pos) = positions {
            if !pos.is_empty() {
                _has_positions = true;
                prompt.push_str("CURRENT PORTFOLIO HOLDINGS:\n");
                prompt.push_str("The user ALREADY OWNS these stocks. This is their real portfolio — respect it.\n\n");
                
                for p in pos {
                    let live_price_opt = price_map.get(&p.ticker.to_uppercase()).copied();
                    if let (Some(shares), Some(avg_price)) = (p.shares, p.average_purchase_price) {
                        let current_price = live_price_opt.unwrap_or(avg_price);
                        let current_value = shares * current_price;
                        total_position_value += current_value;
                        if let Some(lp) = live_price_opt {
                            prompt.push_str(&format!("  - {}: {} shares @ ${:.2} avg cost | live price ${:.2} | current value ${:.2}\n",
                                p.ticker, shares, avg_price, lp, current_value));
                        } else {
                            prompt.push_str(&format!("  - {}: {} shares @ ${:.2} avg cost = ${:.2} position value\n",
                                p.ticker, shares, avg_price, current_value));
                        }
                    } else if let Some(shares) = p.shares {
                        if let Some(lp) = live_price_opt {
                            let current_value = shares * lp;
                            total_position_value += current_value;
                            prompt.push_str(&format!("  - {}: {} shares | live price ${:.2} | current value ${:.2} (no avg cost recorded)\n",
                                p.ticker, shares, lp, current_value));
                        } else {
                            prompt.push_str(&format!("  - {}: {} shares (avg cost unknown, current price unavailable — do NOT estimate the price)\n", p.ticker, shares));
                        }
                    } else {
                        prompt.push_str(&format!("  - {}: position exists but details incomplete\n", p.ticker));
                    }
                }
                
                if total_position_value > 0.0 {
                    prompt.push_str(&format!("\nTotal Portfolio Value (live/current): ${:.2}\n", total_position_value));
                }
                prompt.push_str("\n⚠️  HARD CONSTRAINT: The share counts above are the MAXIMUM you can ever suggest selling for each position. Do NOT propose selling more shares than the user owns.\n");
                prompt.push_str("IMPORTANT: If any position looks unusual (concentrated, oversized, etc.), ASK the user about their strategy before suggesting changes. They may be:\n");
                prompt.push_str("- Accumulating to 100 shares for covered calls\n");
                prompt.push_str("- Cost-averaging during a dip\n");
                prompt.push_str("- Running a concentrated conviction play\n\n");
            } else {
                prompt.push_str("CURRENT HOLDINGS: None (100% cash)\n");
                prompt.push_str("The user has no stock positions yet. Recommend a specific initial allocation based on their question.\n\n");
            }
        }

        if let Some(config) = portfolio_config {
            let display_capital = if total_position_value > 0.0 {
                total_position_value
            } else {
                config.total_capital
            };
            prompt.push_str(&format!("ACCOUNT SIZE: ${:.2}\n", display_capital));
            prompt.push_str(&format!("RISK PARAMETERS: max drawdown {:.0}% | min Sharpe {:.2} | max position {:.0}%\n\n", 
                config.max_drawdown_limit * 100.0,
                config.min_sharpe_ratio,
                config.max_position_size * 100.0));
        }

        if let Some(history) = chat_history {
            if !history.is_empty() {
                prompt.push_str("CONVERSATION HISTORY:\n");
                for msg in history {
                    prompt.push_str(&format!("{}: {}\n", msg.role.to_uppercase(), msg.content));
                }
                prompt.push_str("\n");
            }
        }

        prompt.push_str(&format!("USER QUESTION: {}\n\n", inquiry));

        // Progressive refinement: include previous response so the LLM can improve on it
        if let Some(prev) = previous_response {
            prompt.push_str("YOUR PREVIOUS RESPONSE (rejected — improve on this, don't start from scratch):\n");
            // Truncate to avoid token explosion
            let truncated = if prev.len() > 2000 { &prev[..2000] } else { prev };
            prompt.push_str(truncated);
            prompt.push_str("\n\n");
        }

        if !error_history.is_empty() {
            prompt.push_str("REJECTION REASONS (fix ALL of these):\n");
            for (i, error) in error_history.iter().enumerate() {
                prompt.push_str(&format!("{}. {}\n", i + 1, error));
            }
            prompt.push_str("\nRefine your previous response to fix these issues. Keep what was good, fix what was wrong.\n\n");
        }

        prompt.push_str("CRITICAL INSTRUCTION: You MUST respond with ONLY a valid JSON object. Do not include any introductory or concluding text. Do not wrap the JSON in markdown code blocks. The JSON must exactly match the TrajectoryProjection schema. Put your conversational answer inside the `reasoning` field of the JSON.");
        prompt
    }

    fn build_constraint_error_message(&self, error: &str, projection: &TrajectoryProjection) -> String {
        if error.contains("drawdown") {
            format!(
                "CONSTRAINT VIOLATION: Projected drawdown {:.1}% exceeds max {:.0}%. \
                 Reduce overall portfolio volatility — add bonds/treasuries, reduce volatile positions, \
                 or increase diversification. Target a drawdown under {:.0}%.",
                projection.projected_max_drawdown * 100.0,
                self.constraints.max_drawdown_pct * 100.0,
                self.constraints.max_drawdown_pct * 100.0
            )
        } else if error.contains("Sharpe") {
            format!(
                "CONSTRAINT VIOLATION: Sharpe ratio {:.2} is below minimum {:.2}. \
                 Improve risk-adjusted returns: either increase expected return (better asset selection) \
                 or reduce volatility (more diversification). Don't just inflate numbers — improve the actual allocation.",
                projection.projected_sharpe,
                self.constraints.min_sharpe_ratio
            )
        } else if error.contains("Position") && error.contains("exceeds maximum") {
            if let Some(oversized) = projection.proposed_allocation.iter()
                .find(|a| a.weight > self.constraints.max_position_size_pct) {
                format!(
                    "CONSTRAINT VIOLATION: {} at {:.1}% exceeds the {:.0}% position limit. \
                     In your reasoning, ASK the user if this concentration is intentional \
                     (e.g., accumulating for covered calls, conviction play). \
                     For now, cap it at {:.0}% and redistribute the excess.",
                    oversized.ticker,
                    oversized.weight * 100.0,
                    self.constraints.max_position_size_pct * 100.0,
                    self.constraints.max_position_size_pct * 100.0
                )
            } else {
                error.to_string()
            }
        } else if error.contains("confidence") {
            format!(
                "CONSTRAINT VIOLATION: Confidence {:.0}% below minimum {:.0}%. \
                 If you're genuinely uncertain, explain why in the reasoning and suggest what additional info would help. \
                 But if your analysis is sound, a confidence of {:.0}%+ is reasonable.",
                projection.confidence_score * 100.0,
                self.constraints.min_confidence_score * 100.0,
                self.constraints.min_confidence_score * 100.0
            )
        } else {
            error.to_string()
        }
    }

    /// Strip `// ...` line comments and trailing commas from a JSON-like string so that
    /// slightly malformed LLM output can still be parsed by serde_json.
    fn sanitize_json(raw: &str) -> String {
        let mut out = String::with_capacity(raw.len());
        let mut in_string = false;
        let mut escape_next = false;
        let chars: Vec<char> = raw.chars().collect();
        let mut i = 0;
        while i < chars.len() {
            let ch = chars[i];
            if escape_next {
                out.push(ch);
                escape_next = false;
                i += 1;
                continue;
            }
            if ch == '\\' && in_string {
                out.push(ch);
                escape_next = true;
                i += 1;
                continue;
            }
            if ch == '"' {
                in_string = !in_string;
                out.push(ch);
                i += 1;
                continue;
            }
            // Escape raw newlines/tabs inside string literals (invalid JSON but LLMs do it)
            if in_string {
                match ch {
                    '\n' => { out.push('\\'); out.push('n'); i += 1; continue; }
                    '\r' => { i += 1; continue; } // drop bare \r
                    '\t' => { out.push('\\'); out.push('t'); i += 1; continue; }
                    _ => {}
                }
            }
            // Strip // line comments only outside strings
            if !in_string && ch == '/' && i + 1 < chars.len() && chars[i + 1] == '/' {
                while i < chars.len() && chars[i] != '\n' {
                    i += 1;
                }
                continue;
            }
            out.push(ch);
            i += 1;
        }
        // Remove trailing commas before ] or }
        let out_chars: Vec<char> = out.chars().collect();
        let mut cleaned = String::with_capacity(out.len());
        let mut j = 0;
        while j < out_chars.len() {
            if out_chars[j] == ',' {
                // Look ahead for next non-whitespace char
                let mut k = j + 1;
                while k < out_chars.len() && (out_chars[k] == ' ' || out_chars[k] == '\t' || out_chars[k] == '\n' || out_chars[k] == '\r') {
                    k += 1;
                }
                if k < out_chars.len() && (out_chars[k] == ']' || out_chars[k] == '}') {
                    j += 1;
                    continue; // drop the trailing comma
                }
            }
            cleaned.push(out_chars[j]);
            j += 1;
        }
        cleaned
    }

    fn parse_projection(&self, response: &str, portfolio_id: Uuid) -> Result<TrajectoryProjection, String> {
        // Extract JSON from response (LLM might add text before/after)
        let json_str = if let Some(start) = response.find('{') {
            if let Some(end) = response.rfind('}') {
                &response[start..=end]
            } else {
                response
            }
        } else {
            response
        };
        let sanitized = Self::sanitize_json(json_str);
        let json_str = sanitized.as_str();

        #[derive(Deserialize)]
        struct LlmProjection {
            proposed_allocation: Vec<crate::validator::AssetAllocation>,
            projected_sharpe: f64,
            projected_max_drawdown: f64,
            confidence_score: f64,
            #[serde(default)]
            scenario_chart: Option<crate::validator::ScenarioChartParams>,
            #[serde(default)]
            pending_actions: Option<Vec<crate::llm::tools::portfolio::PendingAction>>,
            reasoning: String,
        }

        let llm_proj: LlmProjection = serde_json::from_str(json_str)
            .map_err(|e| format!("JSON parse error: {}", e))?;

        Ok(TrajectoryProjection {
            portfolio_id,
            timestamp: Utc::now(),
            proposed_allocation: llm_proj.proposed_allocation,
            projected_sharpe: llm_proj.projected_sharpe,
            projected_max_drawdown: llm_proj.projected_max_drawdown,
            confidence_score: llm_proj.confidence_score,
            scenario_chart: llm_proj.scenario_chart,
            pending_actions: llm_proj.pending_actions,
            reasoning: llm_proj.reasoning,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::{LlmError, LlmProvider};
    use async_trait::async_trait;

    struct MockProvider {
        responses: Vec<String>,
        current: std::sync::Mutex<usize>,
    }

    #[async_trait]
    impl LlmProvider for MockProvider {
        async fn complete(&self, _system: &str, _user: &str) -> Result<crate::llm::tool::LlmResponse, LlmError> {
            let mut idx = self.current.lock().unwrap();
            let response = self.responses.get(*idx).cloned().unwrap_or_else(|| {
                r#"{"proposed_allocation":[{"ticker":"VTI","weight":0.6},{"ticker":"BND","weight":0.4}],"projected_sharpe":1.2,"projected_max_drawdown":0.15,"confidence_score":0.85,"reasoning":"Balanced allocation"}"#.to_string()
            });
            *idx += 1;
            Ok(crate::llm::tool::LlmResponse {
                text: response,
                tool_calls: vec![],
                input_tokens_estimate: 0,
                output_tokens_estimate: 0,
            })
        }

        fn name(&self) -> &'static str {
            "mock"
        }
    }

}
