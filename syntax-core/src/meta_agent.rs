use std::collections::HashMap;
use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use crate::llm::LlmProvider;
use std::sync::Arc;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TradeMemory {
    pub ticker: String,
    pub date: String,
    pub action: String,
    pub reason_rejected: Option<String>,
    pub reason_accepted: Option<String>,
    pub sharpe: f64,
    pub drawdown: f64,
}

/// DGM-H Phase 3: Single verification experiment record for imp@k calculation.
/// imp@k = improvement in best Sharpe achieved within k iterations vs baseline.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VerificationRecord {
    pub experiment_id: u64,
    pub timestamp: String,
    pub model_used: String,
    pub complexity_tier: String,           // "simple" | "standard" | "deep"
    pub attempts: usize,
    pub success: bool,
    pub failure_reason: Option<String>,    // "compilation" | "logic" | "timeout" | "constraint"
    pub sharpe_achieved: f64,
    pub drawdown_achieved: f64,
    pub confidence: f64,
    pub cost_usd: f64,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub latency_ms: u64,
    pub heuristic_score: f64,             // score_projection() output — drives imp@k
}

/// DGM-H Phase 3: Aggregate statistics over the Step-Stone Archive for a model/tier.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ModelStats {
    pub total_calls: u64,
    pub success_rate: f64,
    pub avg_attempts: f64,
    pub avg_cost_usd: f64,
    pub avg_latency_ms: f64,
    pub best_sharpe: f64,
    pub avg_heuristic_score: f64,
}

#[derive(Serialize, Deserialize, Default)]
pub struct PerformanceTracker {
    pub memory: HashMap<String, Vec<TradeMemory>>,
    /// Step-Stone Archive: ordered list of all verification experiments
    pub archive: Vec<VerificationRecord>,
    /// Aggregated model statistics (keyed by model name)
    pub model_stats: HashMap<String, ModelStats>,
}

impl PerformanceTracker {
    pub fn new() -> Self {
        let path = "performance_history.json";
        if Path::new(path).exists() {
            if let Ok(content) = fs::read_to_string(path) {
                if let Ok(tracker) = serde_json::from_str(&content) {
                    return tracker;
                }
            }
        }
        Self::default()
    }

    pub fn save(&self) {
        let path = "performance_history.json";
        if let Ok(content) = serde_json::to_string_pretty(self) {
            let _ = fs::write(path, content);
        }
    }

    pub fn record_trade(&mut self, ticker: &str, trade: TradeMemory) {
        self.memory.entry(ticker.to_string()).or_default().push(trade);
        self.save();
    }
    
    pub fn get_history(&self, ticker: &str) -> Vec<TradeMemory> {
        self.memory.get(ticker).cloned().unwrap_or_default()
    }

    /// DGM-H Phase 3: Record a verification experiment and update aggregate model stats.
    /// This is the primary input to the imp@k self-improvement loop.
    pub fn record_verification(&mut self, record: VerificationRecord) {
        let model = record.model_used.clone();
        
        // Update model stats
        let stats = self.model_stats.entry(model).or_default();
        let n = stats.total_calls as f64;
        stats.total_calls += 1;
        let n1 = stats.total_calls as f64;
        // Exponential moving average for smooth tracking
        stats.success_rate = (stats.success_rate * n + if record.success { 1.0 } else { 0.0 }) / n1;
        stats.avg_attempts = (stats.avg_attempts * n + record.attempts as f64) / n1;
        stats.avg_cost_usd = (stats.avg_cost_usd * n + record.cost_usd) / n1;
        stats.avg_latency_ms = (stats.avg_latency_ms * n + record.latency_ms as f64) / n1;
        stats.avg_heuristic_score = (stats.avg_heuristic_score * n + record.heuristic_score) / n1;
        if record.sharpe_achieved > stats.best_sharpe {
            stats.best_sharpe = record.sharpe_achieved;
        }

        self.archive.push(record);
        // Keep archive bounded to last 1000 records to prevent unbounded growth
        if self.archive.len() > 1000 {
            self.archive.drain(0..100);
        }
        self.save();
    }

    /// DGM-H: Calculate imp@k — improvement of best heuristic score vs the initial agent
    /// over the last k experiments. Returns (initial_score, best_score, improvement_pct).
    pub fn imp_at_k(&self, k: usize) -> (f64, f64, f64) {
        if self.archive.is_empty() {
            return (0.0, 0.0, 0.0);
        }
        let window: Vec<&VerificationRecord> = self.archive.iter().rev().take(k).collect();
        let initial = window.last().map(|r| r.heuristic_score).unwrap_or(0.0);
        let best = window.iter().map(|r| r.heuristic_score).fold(f64::NEG_INFINITY, f64::max);
        let improvement = if initial > 0.0 { (best - initial) / initial * 100.0 } else { 0.0 };
        (initial, best, improvement)
    }
}

pub struct MetaAgent {
    llm: Arc<dyn LlmProvider>,
}

impl MetaAgent {
    pub fn new(llm: Arc<dyn LlmProvider>) -> Self {
        Self { llm }
    }

    /// Background Daemon using the Batch Processing Paradigm
    /// In production, this would use the explicit Gemini Batch API (JSONL via GCS).
    /// Here, we process overnight to simulate the batch tier discount and self-improvement.
    pub async fn run_overnight_batch_analysis(&self) {
        tracing::info!("MetaAgent: Starting overnight batch processing of research logs...");
        
        let path = "research_log.txt";
        let logs = if Path::new(path).exists() {
            fs::read_to_string(path).unwrap_or_default()
        } else {
            String::new()
        };

        if logs.is_empty() {
            tracing::info!("MetaAgent: No logs to process.");
            return;
        }

        let system_prompt = "You are the Meta Agent. Review the following research log of trades and analyses. Extract rejected and accepted trades, along with the reasoning, Sharpe ratio, and drawdown. Format your response strictly as a JSON array of TradeMemory objects.";
        
        // Simulating the Batch API call which is discounted 50%
        tracing::info!("MetaAgent: Submitting batch job for self-improvement analysis...");
        
        let result = self.llm.complete(system_prompt, &logs).await;
        
        match result {
            Ok(res) => {
                // Parse the response into TradeMemory
                let text = res.text.replace("```json", "").replace("```", "").trim().to_string();
                if let Ok(parsed_trades) = serde_json::from_str::<Vec<TradeMemory>>(&text) {
                    let mut tracker = PerformanceTracker::new();
                    for trade in parsed_trades {
                        tracker.record_trade(&trade.ticker.clone(), trade);
                    }
                    tracing::info!("MetaAgent: Successfully updated performance_history.json via batch analysis.");
                } else {
                    tracing::warn!("MetaAgent: Failed to parse batch output as JSON.");
                }
            }
            Err(e) => {
                tracing::error!("MetaAgent: Batch processing failed: {:?}", e);
            }
        }
    }
}
