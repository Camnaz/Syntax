use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrajectoryProjection {
    pub portfolio_id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub proposed_allocation: Vec<AssetAllocation>,
    pub projected_sharpe: f64,
    pub projected_max_drawdown: f64,
    pub confidence_score: f64,
    #[serde(default)]
    pub scenario_chart: Option<ScenarioChartParams>,
    #[serde(default)]
    pub pending_actions: Option<Vec<crate::llm::tools::portfolio::PendingAction>>,
    pub reasoning: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioChartParams {
    pub enabled: bool,
    #[serde(default)]
    pub initial_capital: Option<f64>,
    #[serde(default)]
    pub time_horizon_days: Option<u32>,
    #[serde(default)]
    pub bull_annual_return: Option<f64>,
    #[serde(default)]
    pub base_annual_return: Option<f64>,
    #[serde(default)]
    pub bear_annual_return: Option<f64>,
    #[serde(default)]
    pub volatility: Option<f64>,
    #[serde(default)]
    pub dca_monthly_amount: Option<f64>,
    #[serde(default)]
    pub suggested_sell_points: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetAllocation {
    pub ticker: String,
    pub weight: f64,
}

#[derive(Debug, Clone)]
pub struct PortfolioConstraints {
    pub max_drawdown_pct: f64,
    pub min_sharpe_ratio: f64,
    pub max_position_size_pct: f64,
    pub min_confidence_score: f64,
}

impl Default for PortfolioConstraints {
    fn default() -> Self {
        Self {
            max_drawdown_pct: 0.035,      // 3.5% max drawdown
            min_sharpe_ratio: 1.6,        // Minimum Sharpe ratio 1.6
            max_position_size_pct: 0.40,  // 40% max single position
            min_confidence_score: 0.70,   // 70% minimum confidence
        }
    }
}

#[derive(Debug)]
pub enum ValidationError {
    DrawdownExceeded {
        projected: f64,
        max_allowed: f64,
    },
    SharpeTooLow {
        projected: f64,
        min_required: f64,
    },
    PositionTooLarge {
        ticker: String,
        weight: f64,
        max_allowed: f64,
    },
    ConfidenceTooLow {
        score: f64,
        min_required: f64,
    },
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ValidationError::DrawdownExceeded { projected, max_allowed } => {
                write!(
                    f,
                    "Projected drawdown {:.2}% exceeds maximum allowed {:.2}%",
                    projected * 100.0,
                    max_allowed * 100.0
                )
            }
            ValidationError::SharpeTooLow { projected, min_required } => {
                write!(
                    f,
                    "Projected Sharpe ratio {:.2} is below minimum required {:.2}",
                    projected, min_required
                )
            }
            ValidationError::PositionTooLarge { ticker, weight, max_allowed } => {
                write!(
                    f,
                    "Position {} at {:.2}% exceeds maximum allowed {:.2}%",
                    ticker,
                    weight * 100.0,
                    max_allowed * 100.0
                )
            }
            ValidationError::ConfidenceTooLow { score, min_required } => {
                write!(
                    f,
                    "Confidence score {:.2}% is below minimum required {:.2}%",
                    score * 100.0,
                    min_required * 100.0
                )
            }
        }
    }
}

impl std::error::Error for ValidationError {}

pub async fn validate_trajectory(
    projection: &mut TrajectoryProjection,
    constraints: &PortfolioConstraints,
) -> Result<(), ValidationError> {
    // If the LLM returned an empty allocation (conversational/no-data response),
    // skip all metric checks — the reasoning field carries the value.
    if projection.proposed_allocation.is_empty() {
        return Ok(());
    }

    // Keep strict structural constraints (position size) regardless of metric source.
    // CASH / USD are exempt — holding cash is always valid at any concentration.
    for allocation in &projection.proposed_allocation {
        let is_cash = matches!(
            allocation.ticker.to_uppercase().as_str(),
            "CASH" | "USD" | "CASH_USD" | "USDC" | "USDT"
        );
        if !is_cash && allocation.weight > constraints.max_position_size_pct {
            return Err(ValidationError::PositionTooLarge {
                ticker: allocation.ticker.clone(),
                weight: allocation.weight,
                max_allowed: constraints.max_position_size_pct,
            });
        }
    }

    // Recalculate deterministically only when model metrics are missing/unrealistic.
    // This avoids retry loops where deterministic one-year Yahoo metrics repeatedly
    // override otherwise valid projections and make convergence impossible.
    let should_recalculate_metrics = !projection.projected_sharpe.is_finite()
        || projection.projected_sharpe <= 0.0
        || projection.projected_sharpe > 5.0
        || !projection.projected_max_drawdown.is_finite()
        || projection.projected_max_drawdown <= 0.0
        || projection.projected_max_drawdown > 1.0;

    if should_recalculate_metrics && !projection.proposed_allocation.is_empty() {
        let mut weighted_sharpe_sum = 0.0;
        let mut weighted_drawdown_sum = 0.0;
        let mut invested_weight_sum = 0.0;
        let mut deterministic_complete = true;

        for allocation in &projection.proposed_allocation {
            if allocation.weight <= 0.0 {
                continue;
            }

            match crate::llm::tools::prices::calculate_asset_metrics(&allocation.ticker).await {
                Ok(metrics) => {
                    weighted_sharpe_sum += metrics.sharpe_ratio * allocation.weight;
                    weighted_drawdown_sum += metrics.max_drawdown * allocation.weight;
                    invested_weight_sum += allocation.weight;
                }
                Err(_) => {
                    deterministic_complete = false;
                    break;
                }
            }
        }

        if deterministic_complete && invested_weight_sum > 0.0 {
            projection.projected_sharpe = weighted_sharpe_sum / invested_weight_sum;
            projection.projected_max_drawdown = weighted_drawdown_sum / invested_weight_sum;
        }
    }

    // Check drawdown
    if projection.projected_max_drawdown > constraints.max_drawdown_pct {
        return Err(ValidationError::DrawdownExceeded {
            projected: projection.projected_max_drawdown,
            max_allowed: constraints.max_drawdown_pct,
        });
    }

    // Check Sharpe ratio
    if projection.projected_sharpe < constraints.min_sharpe_ratio {
        return Err(ValidationError::SharpeTooLow {
            projected: projection.projected_sharpe,
            min_required: constraints.min_sharpe_ratio,
        });
    }

    // Check confidence score
    if projection.confidence_score < constraints.min_confidence_score {
        return Err(ValidationError::ConfidenceTooLow {
            score: projection.confidence_score,
            min_required: constraints.min_confidence_score,
        });
    }

    Ok(())
}
