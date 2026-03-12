-- SYNTAX v2.0 — Row Level Security
-- CRITICAL: Without these, any authenticated user can read all rows

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE trajectory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_escrow ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE loop_metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_portfolios" ON portfolios
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_read_own_trajectory" ON trajectory_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_read_own_escrow" ON billing_escrow
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_read_own_subscription" ON user_subscriptions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "public_read_loop_metrics" ON loop_metrics_daily
    FOR SELECT USING (true);
