use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpsertPositionArgs {
    pub ticker: String,
    pub shares: Option<f64>,
    pub average_purchase_price: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingAction {
    #[serde(default)]
    pub id: String,
    #[serde(rename = "type")]
    pub action_type: String,
    pub description: String,
    pub data: serde_json::Value,
}

pub fn upsert_position_declaration() -> crate::llm::tool::FunctionDeclaration {
    crate::llm::tool::FunctionDeclaration {
        name: "upsert_portfolio_position".to_string(),
        description: "Updates or adds a stock position to the user's portfolio. Use this when the user explicitly tells you they bought, sold, or currently hold a specific stock with a specific number of shares. For sales, you should also increase the available_cash by proposing a cash update action.".to_string(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": {
                "ticker": {
                    "type": "string",
                    "description": "The stock ticker symbol (e.g., AAPL, TSLA)"
                },
                "shares": {
                    "type": "number",
                    "description": "The number of shares the user currently owns. Set to 0 if they sold all of it."
                },
                "average_purchase_price": {
                    "type": "number",
                    "description": "The average purchase price per share, if known."
                }
            },
            "required": ["ticker", "shares"]
        }),
    }
}

pub fn pending_actions_declaration() -> crate::llm::tool::FunctionDeclaration {
    crate::llm::tool::FunctionDeclaration {
        name: "propose_portfolio_actions".to_string(),
        description: "Propose a set of portfolio actions to the user for confirmation. Use this when the user says they bought/sold a stock, or when you want to suggest trades, cash updates, or risk profile updates. Do not assume any action is final until confirmed. If a user sells a stock, remember to add an action to increase the available cash by the sale amount.".to_string(),
        parameters: serde_json::json!({
            "type": "object",
            "properties": {
                "actions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": {
                                "type": "string",
                                "enum": ["add_position", "update_position", "remove_position", "update_risk_profile", "update_cash"],
                                "description": "The type of action to propose"
                            },
                            "description": {
                                "type": "string",
                                "description": "A clear, human-readable description of the action (e.g., 'Update Apple (AAPL) position to 50 shares', 'Add $1,500 to available cash')"
                            },
                            "data": {
                                "type": "object",
                                "description": "The specific data for the action (e.g., {\"ticker\": \"AAPL\", \"shares\": 50}, {\"cash_amount\": 1500})"
                            }
                        },
                        "required": ["type", "description", "data"]
                    }
                }
            },
            "required": ["actions"]
        }),
    }
}
