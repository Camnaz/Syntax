-- Table for persisting verified stock facts and user corrections
-- When a user corrects SYNTAX about a stock (e.g., "NTSK is NetSkope, not Nighthawk"),
-- and SYNTAX verifies the correction, the fact is saved here for future context.
create table public.stock_memories (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users not null,
    ticker text not null,
    fact text not null,
    source text, -- optional URL or source name for the fact
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,

    unique(user_id, ticker, fact)
);

-- RLS
alter table public.stock_memories enable row level security;
create policy "Users can view own stock memories" on stock_memories for select using (auth.uid() = user_id);
create policy "Users can insert own stock memories" on stock_memories for insert with check (auth.uid() = user_id);
create policy "Users can update own stock memories" on stock_memories for update using (auth.uid() = user_id);
create policy "Users can delete own stock memories" on stock_memories for delete using (auth.uid() = user_id);
