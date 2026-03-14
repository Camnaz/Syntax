-- Table for portfolio positions (stocks owned, amount, purchase price)
create table public.positions (
    id uuid default uuid_generate_v4() primary key,
    portfolio_id uuid references public.portfolios on delete cascade not null,
    ticker text not null,
    shares numeric,
    dollar_amount numeric,
    average_purchase_price numeric,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    unique(portfolio_id, ticker)
);

-- Table for chat sessions/threads
create table public.chat_sessions (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references auth.users not null,
    title text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Table for chat messages within a session
create table public.chat_messages (
    id uuid default uuid_generate_v4() primary key,
    session_id uuid references public.chat_sessions on delete cascade not null,
    role text not null check (role in ('user', 'assistant', 'system')),
    content text not null,
    projection_data jsonb, -- Store the final allocation/metrics here if applicable
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Set up Row Level Security (RLS)

-- Positions RLS
alter table public.positions enable row level security;
create policy "Users can view own positions" on positions for select using (
    exists (select 1 from portfolios where id = positions.portfolio_id and user_id = auth.uid())
);
create policy "Users can insert own positions" on positions for insert with check (
    exists (select 1 from portfolios where id = positions.portfolio_id and user_id = auth.uid())
);
create policy "Users can update own positions" on positions for update using (
    exists (select 1 from portfolios where id = positions.portfolio_id and user_id = auth.uid())
);
create policy "Users can delete own positions" on positions for delete using (
    exists (select 1 from portfolios where id = positions.portfolio_id and user_id = auth.uid())
);

-- Chat Sessions RLS
alter table public.chat_sessions enable row level security;
create policy "Users can view own chat sessions" on chat_sessions for select using (auth.uid() = user_id);
create policy "Users can insert own chat sessions" on chat_sessions for insert with check (auth.uid() = user_id);
create policy "Users can update own chat sessions" on chat_sessions for update using (auth.uid() = user_id);
create policy "Users can delete own chat sessions" on chat_sessions for delete using (auth.uid() = user_id);

-- Chat Messages RLS
alter table public.chat_messages enable row level security;
create policy "Users can view own chat messages" on chat_messages for select using (
    exists (select 1 from chat_sessions where id = chat_messages.session_id and user_id = auth.uid())
);
create policy "Users can insert own chat messages" on chat_messages for insert with check (
    exists (select 1 from chat_sessions where id = chat_messages.session_id and user_id = auth.uid())
);
