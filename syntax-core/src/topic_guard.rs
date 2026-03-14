use crate::llm::{LlmError, LlmProvider};
use serde::{Deserialize, Serialize};

const TOPIC_GUARD_SYSTEM_PROMPT: &str = r#"You are a strict content classifier for a stock portfolio analysis system.

Your ONLY job is to determine if a user inquiry is about legitimate stock portfolio management, risk analysis, and options strategies.

ACCEPT these topics:
- Stock portfolio rebalancing strategies
- Stock and ETF/ETP asset allocation analysis
- Drawdown protection and risk management for stock portfolios
- Sharpe ratio optimization
- Position sizing and diversification (stocks, ETFs, and stock options)
- Tax-loss harvesting for stock positions
- Portfolio performance attribution
- Risk-adjusted return analysis
- Options strategies (covered calls, protective puts, spreads, collars, etc.)
- Aggressive growth strategies using options
- Hedging stock positions with options
- Income generation through options writing
- ETFs and ETPs that provide exposure to commodities (GLD, SLV, USO, etc.)
- ETFs and ETPs that provide exposure to cryptocurrencies (BITO, GBTC, etc.)
- ETFs and ETPs that provide exposure to real estate (VNQ, IYR, etc.)
- ETFs and ETPs that provide exposure to currencies or international markets

REJECT these topics:
- Direct cryptocurrency trading or wallet management
- Direct forex trading on currency exchanges
- Direct commodities futures trading
- Direct real estate property investment advice
- Market timing predictions or "hot stock tips"
- "Get rich quick" schemes
- Penny stocks or microcap speculation
- Day trading strategies (unless part of a broader portfolio strategy)
- Non-financial topics (weather, sports, general questions, etc.)

KEY DISTINCTION: ETFs/ETPs that trade on stock exchanges are ACCEPTED. Direct trading of the underlying assets (crypto wallets, forex accounts, futures contracts, property) is REJECTED.

Respond with ONLY a JSON object in this exact format:
{
  "is_financial": true/false,
  "reason": "brief explanation"
}

If the inquiry is about stock portfolio management, ETF/ETP allocation, or options strategies, set is_financial to true.
If it's about direct crypto/forex/commodities trading, property investment, or non-financial topics, set is_financial to false.

Be strict about the stock exchange requirement. When in doubt about whether it's an ETF or direct trading, reject."#;

#[derive(Debug, Serialize, Deserialize)]
pub struct TopicClassification {
    pub is_financial: bool,
    pub reason: String,
}

pub async fn classify_topic(
    provider: &dyn LlmProvider,
    inquiry: &str,
) -> Result<TopicClassification, LlmError> {
    let response = provider
        .complete(TOPIC_GUARD_SYSTEM_PROMPT, inquiry)
        .await?;

    // Try to extract JSON from the response
    let json_str = if let Some(start) = response.text.find('{') {
        if let Some(end) = response.text.rfind('}') {
            &response.text[start..=end]
        } else {
            &response.text
        }
    } else {
        &response.text
    };

    serde_json::from_str::<TopicClassification>(json_str)
        .map_err(|e| LlmError::ParseError(format!("Failed to parse topic classification: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;

    struct MockProvider {
        response: String,
    }

    #[async_trait]
    impl LlmProvider for MockProvider {
        async fn complete(&self, _system: &str, _user: &str) -> Result<crate::llm::tool::LlmResponse, LlmError> {
            Ok(crate::llm::tool::LlmResponse {
                text: self.response.clone(),
                tool_calls: vec![],
                input_tokens_estimate: 0,
                output_tokens_estimate: 0,
            })
        }

        fn name(&self) -> &'static str {
            "mock"
        }
    }

    #[tokio::test]
    async fn test_accepts_financial_inquiry() {
        let provider = MockProvider {
            response: r#"{"is_financial": true, "reason": "Portfolio rebalancing is a legitimate financial topic"}"#.to_string(),
        };

        let result = classify_topic(&provider, "Should I rebalance my portfolio?").await;
        assert!(result.is_ok());
        let classification = result.unwrap();
        assert!(classification.is_financial);
    }

    #[tokio::test]
    async fn test_rejects_non_financial() {
        let provider = MockProvider {
            response: r#"{"is_financial": false, "reason": "Weather is not a financial topic"}"#.to_string(),
        };

        let result = classify_topic(&provider, "What's the weather today?").await;
        assert!(result.is_ok());
        let classification = result.unwrap();
        assert!(!classification.is_financial);
    }

    #[tokio::test]
    async fn test_rejects_stock_tips() {
        let provider = MockProvider {
            response: r#"{"is_financial": false, "reason": "Individual stock recommendations are not allowed"}"#.to_string(),
        };

        let result = classify_topic(&provider, "Should I buy TSLA stock?").await;
        assert!(result.is_ok());
        let classification = result.unwrap();
        assert!(!classification.is_financial);
    }
}
