//! Test factory for SYNTAX - Fake users, mock LLM, simulated transactions
//! All tests use zero-cost mocks to avoid real LLM spend

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

/// Mock LLM provider for testing - zero cost, instant responses
pub struct MockLlmProvider {
    response_delay_ms: u64,
    mock_responses: Arc<Mutex<HashMap<String, String>>>,
    call_count: Arc<Mutex<u32>>,
}

impl MockLlmProvider {
    pub fn new() -> Self {
        Self {
            response_delay_ms: 10, // Simulate 10ms LLM latency
            mock_responses: Arc::new(Mutex::new(HashMap::new())),
            call_count: Arc::new(Mutex::new(0)),
        }
    }

    pub fn with_delay(mut self, ms: u64) -> Self {
        self.response_delay_ms = ms;
        self
    }

    /// Simulate LLM call with zero cost
    pub async fn complete(&self, _system: &str, user: &str) -> MockLlmResponse {
        let mut count = self.call_count.lock().await;
        *count += 1;
        drop(count);

        // Simulate network latency
        tokio::time::sleep(tokio::time::Duration::from_millis(self.response_delay_ms)).await;

        MockLlmResponse {
            text: format!("Mock response for: {}", user),
            input_tokens: 1000,
            output_tokens: 500,
            cost_cents: 0, // Zero cost for testing
            latency_ms: self.response_delay_ms,
        }
    }

    pub async fn get_call_count(&self) -> u32 {
        *self.call_count.lock().await
    }
}

#[derive(Debug, Clone)]
pub struct MockLlmResponse {
    pub text: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cost_cents: i32,
    pub latency_ms: u64,
}

/// Fake user factory for testing rate limiting
pub struct UserFactory;

impl UserFactory {
    pub fn new() -> Self {
        Self
    }

    /// Create a fake user with specified tier
    pub async fn create_user(&self, tier: &str) -> Result<FakeUser, String> {
        let user_id = Uuid::new_v4();
        let email = format!("test-{}@syntax.test", user_id);

        // Insert user into auth.users (mock)
        // Insert subscription with tier
        let subscription = match tier {
            "observer" => FakeSubscription::observer(user_id),
            "operator" => FakeSubscription::operator(user_id),
            "sovereign" => FakeSubscription::sovereign(user_id),
            "institutional" => FakeSubscription::institutional(user_id),
            _ => return Err(format!("Unknown tier: {}", tier)),
        };

        Ok(FakeUser {
            id: user_id,
            email,
            tier: tier.to_string(),
            subscription,
        })
    }

    /// Create multiple users for load testing
    pub async fn create_batch(&self, tier: &str, count: usize) -> Vec<FakeUser> {
        let mut users = Vec::with_capacity(count);
        for _ in 0..count {
            if let Ok(user) = self.create_user(tier).await {
                users.push(user);
            }
        }
        users
    }
}

#[derive(Debug, Clone)]
pub struct FakeUser {
    pub id: Uuid,
    pub email: String,
    pub tier: String,
    pub subscription: FakeSubscription,
}

#[derive(Debug, Clone)]
pub struct FakeSubscription {
    pub user_id: Uuid,
    pub tier: String,
    pub weekly_used: i32,
    pub weekly_limit: i32,
    pub monthly_used: i32,
    pub monthly_limit: i32,
    pub yearly_used: i32,
    pub yearly_limit: i32,
    pub cost_cents: i32,
    pub cost_limit_cents: i32,
}

impl FakeSubscription {
    fn observer(user_id: Uuid) -> Self {
        Self {
            user_id,
            tier: "observer".to_string(),
            weekly_used: 0,
            weekly_limit: 0,
            monthly_used: 0,
            monthly_limit: 3,
            yearly_used: 0,
            yearly_limit: 3,
            cost_cents: 0,
            cost_limit_cents: 50,
        }
    }

    fn operator(user_id: Uuid) -> Self {
        Self {
            user_id,
            tier: "operator".to_string(),
            weekly_used: 0,
            weekly_limit: 100,
            monthly_used: 0,
            monthly_limit: 400,
            yearly_used: 0,
            yearly_limit: 5200,
            cost_cents: 0,
            cost_limit_cents: 300, // $3/week
        }
    }

    fn sovereign(user_id: Uuid) -> Self {
        Self {
            user_id,
            tier: "sovereign".to_string(),
            weekly_used: 0,
            weekly_limit: 0,
            monthly_used: 0,
            monthly_limit: 500,
            yearly_used: 0,
            yearly_limit: 6000,
            cost_cents: 0,
            cost_limit_cents: 1200, // $12/month
        }
    }

    fn institutional(user_id: Uuid) -> Self {
        Self {
            user_id,
            tier: "institutional".to_string(),
            weekly_used: 0,
            weekly_limit: 0,
            monthly_used: 0,
            monthly_limit: 833,
            yearly_used: 0,
            yearly_limit: 10000,
            cost_cents: 0,
            cost_limit_cents: 12000, // $120/year
        }
    }
}

/// Simulates verification transactions for testing
pub struct TransactionSimulator {
    llm_provider: MockLlmProvider,
    results: Arc<Mutex<Vec<TransactionResult>>>,
}

#[derive(Debug, Clone)]
pub struct TransactionResult {
    pub user_id: Uuid,
    pub success: bool,
    pub allowed: bool,
    pub period: String,
    pub latency_ms: u64,
    pub cost_cents: i32,
}

impl TransactionSimulator {
    pub fn new() -> Self {
        Self {
            llm_provider: MockLlmProvider::new(),
            results: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Simulate a single verification transaction
    pub async fn simulate_verification(&self, user: &FakeUser) -> TransactionResult {
        let start = std::time::Instant::now();

        // Check rate limit (mock)
        let (allowed, period) = self.check_rate_limit(user).await;

        let result = if allowed {
            // Simulate LLM call
            let llm_response = self.llm_provider.complete("system", "user query").await;

            TransactionResult {
                user_id: user.id,
                success: true,
                allowed: true,
                period: period.to_string(),
                latency_ms: start.elapsed().as_millis() as u64,
                cost_cents: llm_response.cost_cents,
            }
        } else {
            TransactionResult {
                user_id: user.id,
                success: false,
                allowed: false,
                period: period.to_string(),
                latency_ms: start.elapsed().as_millis() as u64,
                cost_cents: 0,
            }
        };

        self.results.lock().await.push(result.clone());
        result
    }

    /// Simulate multiple concurrent users
    pub async fn simulate_load(&self, users: &[FakeUser], requests_per_user: usize) -> Vec<TransactionResult> {
        let mut handles = Vec::new();

        for user in users {
            let user = user.clone();
            let sim = self.clone();
            let handle = tokio::spawn(async move {
                let mut results = Vec::new();
                for _ in 0..requests_per_user {
                    results.push(sim.simulate_verification(&user).await);
                }
                results
            });
            handles.push(handle);
        }

        let mut all_results = Vec::new();
        for handle in handles {
            if let Ok(results) = handle.await {
                all_results.extend(results);
            }
        }

        all_results
    }

    async fn check_rate_limit(&self, user: &FakeUser) -> (bool, &'static str) {
        match user.tier.as_str() {
            "observer" => {
                if user.subscription.monthly_used >= user.subscription.monthly_limit {
                    return (false, "lifetime");
                }
            }
            "operator" => {
                if user.subscription.weekly_used >= user.subscription.weekly_limit {
                    return (false, "weekly");
                }
                if user.subscription.cost_cents >= user.subscription.cost_limit_cents {
                    return (false, "cost");
                }
            }
            "sovereign" => {
                if user.subscription.monthly_used >= user.subscription.monthly_limit {
                    return (false, "monthly");
                }
                if user.subscription.cost_cents >= user.subscription.cost_limit_cents {
                    return (false, "cost");
                }
            }
            "institutional" => {
                if user.subscription.yearly_used >= user.subscription.yearly_limit {
                    return (false, "yearly");
                }
            }
            _ => {}
        }
        (true, "allowed")
    }

    pub async fn get_results(&self) -> Vec<TransactionResult> {
        self.results.lock().await.clone()
    }

    pub async fn get_stats(&self) -> SimulationStats {
        let results = self.results.lock().await;
        let total = results.len() as u64;
        let successful = results.iter().filter(|r| r.success).count() as u64;
        let blocked = total - successful;

        let avg_latency = if total > 0 {
            results.iter().map(|r| r.latency_ms).sum::<u64>() / total
        } else {
            0
        };

        let total_cost: i32 = results.iter().map(|r| r.cost_cents).sum();

        SimulationStats {
            total_requests: total,
            successful,
            blocked,
            avg_latency_ms: avg_latency,
            total_cost_cents: total_cost,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SimulationStats {
    pub total_requests: u64,
    pub successful: u64,
    pub blocked: u64,
    pub avg_latency_ms: u64,
    pub total_cost_cents: i32,
}

impl Clone for TransactionSimulator {
    fn clone(&self) -> Self {
        Self {
            llm_provider: MockLlmProvider::new(),
            results: Arc::new(Mutex::new(Vec::new())),
        }
    }
}
