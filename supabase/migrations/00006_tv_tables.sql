-- TV projection tables for realtime display

create table if not exists public.tv_walkins (
  id uuid primary key,
  shop_id uuid not null,
  status text not null,
  display_name text,
  position int not null,
  assigned_barber_id uuid,
  called_at timestamptz,
  preference_type text not null,
  preferred_barber_id uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.tv_barber_status (
  shop_id uuid not null,
  barber_id uuid primary key,
  status text not null,
  status_detail text,
  free_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.tv_walkins enable row level security;
alter table public.tv_barber_status enable row level security;

drop policy if exists tv_walkins_anon_select on public.tv_walkins;
create policy tv_walkins_anon_select
on public.tv_walkins for select to anon
using (true);

drop policy if exists tv_barber_status_anon_select on public.tv_barber_status;
create policy tv_barber_status_anon_select
on public.tv_barber_status for select to anon
using (true);

-- Realtime: include TV tables
alter publication supabase_realtime add table public.tv_walkins;
alter publication supabase_realtime add table public.tv_barber_status;

-- Needed for UPDATE/DELETE payloads
alter table public.tv_walkins replica identity full;
alter table public.tv_barber_status replica identity full;
