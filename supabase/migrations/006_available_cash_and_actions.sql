-- Add available_cash to portfolios
ALTER TABLE public.portfolios
ADD COLUMN IF NOT EXISTS available_cash NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
