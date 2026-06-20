-- MTG Trade Supabase schema
-- Run this file in Supabase SQL Editor, or use it as the initial migration if you manage Supabase from Git.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-zA-Z0-9_-]{3,24}$')
);

create table if not exists public.bulks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  visibility text not null default 'public',
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bulks_visibility_check check (visibility in ('public', 'private', 'unlisted'))
);

create table if not exists public.bulk_cards (
  id uuid primary key default gen_random_uuid(),
  bulk_id uuid not null references public.bulks(id) on delete cascade,
  card_id text not null,
  quantity integer not null default 0,
  condition text,
  language text,
  foil boolean not null default false,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bulk_cards_quantity_check check (quantity >= 0),
  unique (bulk_id, card_id, condition, language, foil)
);

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  visibility text not null default 'private',
  share_token text unique,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint decks_visibility_check check (visibility in ('private', 'unlisted', 'public'))
);

create table if not exists public.deck_cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  card_id text not null,
  quantity integer not null default 0,
  section text not null default 'main',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deck_cards_quantity_check check (quantity >= 0),
  unique (deck_id, card_id, section)
);

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null default 'Trade sin nombre',
  status text not null default 'active',
  data jsonb not null default '{"sides":{"a":{"cards":{},"marks":{},"removed":{},"order":[]},"b":{"cards":{},"marks":{},"removed":{},"order":[]}}}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trades_status_check check (status in ('active', 'completed', 'archived', 'cancelled'))
);

create table if not exists public.trade_participants (
  trade_id uuid not null references public.trades(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  side_key text not null,
  role text not null default 'participant',
  acceptance_status text not null default 'pending',
  accepted_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (trade_id, user_id),
  unique (trade_id, side_key),
  constraint trade_participants_side_key_check check (side_key in ('a', 'b')),
  constraint trade_participants_role_check check (role in ('owner', 'participant')),
  constraint trade_participants_acceptance_status_check check (acceptance_status in ('pending', 'accepted'))
);

create or replace function public.is_trade_participant(target_trade_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trade_participants tp
    where tp.trade_id = target_trade_id
      and tp.user_id = auth.uid()
      and tp.left_at is null
  );
$$;

create or replace function public.is_trade_locked(target_trade_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trade_participants tp
    where tp.trade_id = target_trade_id
      and tp.acceptance_status = 'accepted'
      and tp.left_at is null
  );
$$;

create or replace function public.is_trade_creator(target_trade_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trades t
    where t.id = target_trade_id
      and t.created_by = auth.uid()
  );
$$;

create or replace function public.create_trade_with_owner(
  p_title text,
  p_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_trade_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.trades (created_by, title, data)
  values (auth.uid(), coalesce(nullif(p_title, ''), 'Trade sin nombre'), coalesce(p_data, '{}'::jsonb))
  returning id into new_trade_id;

  insert into public.trade_participants (trade_id, user_id, side_key, role)
  values (new_trade_id, auth.uid(), 'a', 'owner');

  return new_trade_id;
end;
$$;

create index if not exists profiles_username_idx on public.profiles (lower(username));
create index if not exists bulks_owner_id_idx on public.bulks (owner_id);
create index if not exists bulks_visibility_idx on public.bulks (visibility);
create index if not exists bulk_cards_bulk_id_idx on public.bulk_cards (bulk_id);
create index if not exists bulk_cards_card_id_idx on public.bulk_cards (card_id);
create index if not exists decks_owner_id_idx on public.decks (owner_id);
create index if not exists decks_visibility_idx on public.decks (visibility);
create index if not exists deck_cards_deck_id_idx on public.deck_cards (deck_id);
create index if not exists deck_cards_card_id_idx on public.deck_cards (card_id);
create index if not exists trades_created_by_idx on public.trades (created_by);
create index if not exists trade_participants_user_id_idx on public.trade_participants (user_id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists bulks_set_updated_at on public.bulks;
create trigger bulks_set_updated_at
before update on public.bulks
for each row execute function public.set_updated_at();

drop trigger if exists bulk_cards_set_updated_at on public.bulk_cards;
create trigger bulk_cards_set_updated_at
before update on public.bulk_cards
for each row execute function public.set_updated_at();

drop trigger if exists decks_set_updated_at on public.decks;
create trigger decks_set_updated_at
before update on public.decks
for each row execute function public.set_updated_at();

drop trigger if exists deck_cards_set_updated_at on public.deck_cards;
create trigger deck_cards_set_updated_at
before update on public.deck_cards
for each row execute function public.set_updated_at();

drop trigger if exists trades_set_updated_at on public.trades;
create trigger trades_set_updated_at
before update on public.trades
for each row execute function public.set_updated_at();

drop trigger if exists trade_participants_set_updated_at on public.trade_participants;
create trigger trade_participants_set_updated_at
before update on public.trade_participants
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.bulks enable row level security;
alter table public.bulk_cards enable row level security;
alter table public.decks enable row level security;
alter table public.deck_cards enable row level security;
alter table public.trades enable row level security;
alter table public.trade_participants enable row level security;

drop policy if exists "Authenticated users can read profiles" on public.profiles;
create policy "Authenticated users can read profiles"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "Users can insert their profile" on public.profiles;
create policy "Users can insert their profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can read visible bulks" on public.bulks;
create policy "Users can read visible bulks"
on public.bulks
for select
to authenticated
using (owner_id = auth.uid() or visibility = 'public');

drop policy if exists "Users can manage their bulks" on public.bulks;
create policy "Users can manage their bulks"
on public.bulks
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Users can read visible bulk cards" on public.bulk_cards;
create policy "Users can read visible bulk cards"
on public.bulk_cards
for select
to authenticated
using (
  exists (
    select 1
    from public.bulks b
    where b.id = bulk_id
      and (b.owner_id = auth.uid() or b.visibility = 'public')
  )
);

drop policy if exists "Users can manage their bulk cards" on public.bulk_cards;
create policy "Users can manage their bulk cards"
on public.bulk_cards
for all
to authenticated
using (
  exists (
    select 1
    from public.bulks b
    where b.id = bulk_id
      and b.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.bulks b
    where b.id = bulk_id
      and b.owner_id = auth.uid()
  )
);

drop policy if exists "Users can read visible decks" on public.decks;
create policy "Users can read visible decks"
on public.decks
for select
to authenticated
using (owner_id = auth.uid() or visibility = 'public');

drop policy if exists "Users can manage their decks" on public.decks;
create policy "Users can manage their decks"
on public.decks
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Users can read visible deck cards" on public.deck_cards;
create policy "Users can read visible deck cards"
on public.deck_cards
for select
to authenticated
using (
  exists (
    select 1
    from public.decks d
    where d.id = deck_id
      and (d.owner_id = auth.uid() or d.visibility = 'public')
  )
);

drop policy if exists "Users can manage their deck cards" on public.deck_cards;
create policy "Users can manage their deck cards"
on public.deck_cards
for all
to authenticated
using (
  exists (
    select 1
    from public.decks d
    where d.id = deck_id
      and d.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.decks d
    where d.id = deck_id
      and d.owner_id = auth.uid()
  )
);

drop policy if exists "Participants can read trades" on public.trades;
create policy "Participants can read trades"
on public.trades
for select
to authenticated
using (created_by = auth.uid() or public.is_trade_participant(id));

drop policy if exists "Users can create trades" on public.trades;
create policy "Users can create trades"
on public.trades
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "Participants can update unlocked trades" on public.trades;
create policy "Participants can update unlocked trades"
on public.trades
for update
to authenticated
using (public.is_trade_participant(id) and not public.is_trade_locked(id))
with check (public.is_trade_participant(id));

drop policy if exists "Trade creators can delete trades" on public.trades;
create policy "Trade creators can delete trades"
on public.trades
for delete
to authenticated
using (created_by = auth.uid());

drop policy if exists "Participants can read trade participants" on public.trade_participants;
create policy "Participants can read trade participants"
on public.trade_participants
for select
to authenticated
using (public.is_trade_participant(trade_id));

drop policy if exists "Trade creators can add participants" on public.trade_participants;
create policy "Trade creators can add participants"
on public.trade_participants
for insert
to authenticated
with check (public.is_trade_creator(trade_id));

drop policy if exists "Participants can update their acceptance" on public.trade_participants;
create policy "Participants can update their acceptance"
on public.trade_participants
for update
to authenticated
using (user_id = auth.uid() or public.is_trade_participant(trade_id))
with check (public.is_trade_participant(trade_id));
