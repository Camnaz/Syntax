-- SYNTAX v2.0 — Initial Schema
-- Run: supabase db push

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Portfolios: user-owned, tier-aware constraint config
CREATE TABLE portfolios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL DEFAULT 'Primary Portfolio',
    total_capital NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    max_drawdown_limit NUMERIC(5, 4) NOT NULL DEFAULT 0.0500,
    min_sharpe_ratio NUMERIC(5, 4) NOT NULL DEFAULT 1.2000,
    max_position_size NUMERIC(5, 4) NOT NULL DEFAULT 0.2500,
    max_loop_attempts SMALLINT NOT NULL DEFAULT 4 CHECK (max_loop_attempts BETWEEN 1 AND 8),
    min_confidence_score NUMERIC(4, 3) NOT NULL DEFAULT 0.750,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trajectory logs: immutable record of every settled verification
CREATE TABLE trajectory_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    inquiry_text TEXT NOT NULL,
    topic_classification_json JSONB,
    verified_allocation_json JSONB,
    verification_loops_required SMALLINT NOT NULL,
    outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('SETTLED', 'TERMINATED', 'REJECTED_TOPIC')),
    llm_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
    olea_fee_usd NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
    provider_used VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Escrow: capital lock/release tracking
CREATE TABLE billing_escrow (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    portfolio_id UUID REFERENCES portfolios(id) ON DELETE SET NULL,
    task_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    locked_credits NUMERIC(10, 4) NOT NULL CHECK (locked_credits >= 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'SETTLED', 'REFUNDED', 'PRUNED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Subscriptions: tier management
CREATE TABLE user_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    tier VARCHAR(20) NOT NULL DEFAULT 'observer'
        CHECK (tier IN ('observer', 'operator', 'sovereign', 'institutional')),
    monthly_verifications_used INTEGER NOT NULL DEFAULT 0,
    monthly_verifications_limit INTEGER NOT NULL DEFAULT 0,
    billing_cycle_start TIMESTAMPTZ DEFAULT date_trunc('month', NOW()),
    stripe_customer_id VARCHAR(100),
    stripe_subscription_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Loop metrics: autoresearch tuning data
CREATE TABLE loop_metrics_daily (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_date DATE NOT NULL DEFAULT CURRENT_DATE UNIQUE,
    total_verifications INTEGER NOT NULL DEFAULT 0,
    settled_count INTEGER NOT NULL DEFAULT 0,
    terminated_count INTEGER NOT NULL DEFAULT 0,
    topic_rejected_count INTEGER NOT NULL DEFAULT 0,
    avg_loops_to_settle NUMERIC(4, 2),
    first_pass_rate NUMERIC(5, 4),
    avg_llm_cost_per_verification NUMERIC(10, 6),
    prompt_variant_id VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_portfolio_user ON portfolios(user_id);
CREATE INDEX idx_trajectory_portfolio ON trajectory_logs(portfolio_id);
CREATE INDEX idx_trajectory_user ON trajectory_logs(user_id);
CREATE INDEX idx_trajectory_outcome ON trajectory_logs(outcome);
CREATE INDEX idx_escrow_user_status ON billing_escrow(user_id, status);
CREATE INDEX idx_subscription_user ON user_subscriptions(user_id);
CREATE INDEX idx_metrics_date ON loop_metrics_daily(metric_date DESC);
