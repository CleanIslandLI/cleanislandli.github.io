-- Clean Island Power Washing: database setup.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run. Safe to run once on a new project.

create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id text primary key,
  name text not null,
  category text not null,
  kind text not null check (kind in ('main','addon')),
  unit text not null check (unit in ('sqft','lf','each','flat')),
  unit_label text not null default 'item',
  rate numeric(10,2) not null check (rate >= 0),
  min_price numeric(10,2) not null default 0 check (min_price >= 0),
  quote_only boolean not null default false,
  active boolean not null default true,
  sort int not null default 100
);

create table if not exists public.discounts (
  code text primary key check (code = upper(code) and length(code) between 3 and 30),
  description text,
  percent_off numeric(5,2) check (percent_off > 0 and percent_off <= 50),
  amount_off numeric(10,2) check (amount_off > 0),
  active boolean not null default true,
  expires_on date,
  max_uses int,
  uses int not null default 0,
  created_at timestamptz not null default now(),
  check ((percent_off is null) <> (amount_off is null))
);

create table if not exists public.blackout_dates (
  day date primary key,
  reason text
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  ref text unique not null,
  access_token text not null,
  kind text not null default 'booking' check (kind in ('booking','quote')),
  status text not null check (status in ('requested','pending_payment','approved','confirmed','completed','paid','rejected','cancelled','expired','quoted')),
  customer_name text not null, email text not null, phone text not null,
  address text, town text, zip text, zone int,
  property_type text, stories text, water_access boolean, access_notes text, notes text,
  items jsonb not null default '[]', estimate jsonb, estimate_total numeric(10,2), final_total numeric(10,2),
  discount_code text references public.discounts(code) on update cascade on delete set null,
  service_date date, time_window text check (time_window in ('am','pm','full','flex')),
  deposit_amount numeric(10,2) not null default 0, amount_paid numeric(10,2) not null default 0,
  photo_paths text[] not null default '{}',
  hold_expires_at timestamptz, refund_due boolean not null default false,
  admin_notes text, ip_hash text,
  history jsonb not null default '[]',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists bookings_date_idx on public.bookings (service_date) where service_date is not null;
create index if not exists bookings_status_idx on public.bookings (status, created_at desc);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  kind text not null check (kind in ('deposit','balance')),
  amount numeric(10,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','paid','expired','refunded','failed')),
  stripe_session_id text unique, stripe_payment_intent text,
  created_at timestamptz not null default now(), paid_at timestamptz, refunded_at timestamptz
);
create index if not exists payments_booking_idx on public.payments (booking_id);

create table if not exists public.rate_events (
  ip_hash text not null, action text not null, created_at timestamptz not null default now()
);
create index if not exists rate_events_idx on public.rate_events (ip_hash, action, created_at);

create table if not exists public.admins (user_id uuid primary key references auth.users(id) on delete cascade);

-- ---------- helpers ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists bookings_touch on public.bookings;
create trigger bookings_touch before update on public.bookings for each row execute function public.touch_updated_at();

-- Remaining crew capacity for one day, morning and afternoon. "Any time" bookings take the roomier window.
create or replace function public.day_capacity(d date, exclude uuid default null)
returns table (am int, pm int)
language plpgsql stable security definer set search_path = public as $$
declare crews int; a int; p int; f int;
begin
  select coalesce((data->>'crews')::int, 2) into crews from settings where id = 1;
  crews := coalesce(crews, 2);
  select
    count(*) filter (where time_window in ('am','full')),
    count(*) filter (where time_window in ('pm','full')),
    count(*) filter (where time_window = 'flex')
  into a, p, f
  from bookings b
  where b.service_date = d and b.kind = 'booking' and (exclude is null or b.id <> exclude)
    and (b.status in ('approved','confirmed','completed','paid')
         or (b.status = 'pending_payment' and b.hold_expires_at > now()));
  am := crews - a; pm := crews - p;
  while f > 0 loop
    if am >= pm then am := am - 1; else pm := pm - 1; end if;
    f := f - 1;
  end loop;
  return next;
end $$;

create or replace function public.window_fits(d date, w text, exclude uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select case w when 'am' then c.am >= 1 when 'pm' then c.pm >= 1
                when 'full' then c.am >= 1 and c.pm >= 1 else c.am + c.pm >= 1 end
  from public.day_capacity(d, exclude) c;
$$;

create or replace function public.get_availability(from_day date, to_day date)
returns table (day date, am int, pm int)
language sql stable security definer set search_path = public as $$
  select g::date, c.am, c.pm
  from generate_series(from_day, least(to_day, from_day + 62), interval '1 day') g
  cross join lateral public.day_capacity(g::date) c;
$$;

-- Inserts a booking only if its time window still has room. A per-day lock prevents double booking.
create or replace function public.reserve_booking(p jsonb) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare d date := nullif(p->>'service_date','')::date; w text := coalesce(p->>'time_window','flex'); r public.bookings;
begin
  if d is not null and (p->>'kind') = 'booking' then
    perform pg_advisory_xact_lock(hashtext('ci-day-' || d::text));
    if not public.window_fits(d, w) then raise exception 'date_full' using errcode = 'P0001'; end if;
  end if;
  insert into public.bookings (ref, access_token, kind, status, customer_name, email, phone, address, town, zip, zone,
    property_type, stories, water_access, access_notes, notes, items, estimate, estimate_total, discount_code,
    service_date, time_window, deposit_amount, photo_paths, hold_expires_at, ip_hash, history)
  values (p->>'ref', p->>'access_token', p->>'kind', p->>'status', p->>'customer_name', p->>'email', p->>'phone',
    p->>'address', p->>'town', p->>'zip', (p->>'zone')::int, p->>'property_type', p->>'stories', (p->>'water_access')::boolean,
    p->>'access_notes', p->>'notes', coalesce(p->'items','[]'), p->'estimate', (p->>'estimate_total')::numeric, nullif(p->>'discount_code',''),
    d, case when d is null then null else w end, coalesce((p->>'deposit_amount')::numeric, 0),
    coalesce(array(select jsonb_array_elements_text(p->'photo_paths')), '{}'), (p->>'hold_expires_at')::timestamptz, p->>'ip_hash',
    jsonb_build_array(jsonb_build_object('at', now(), 'event', 'created', 'status', p->>'status')))
  returning * into r;
  return r;
end $$;

-- Moves a booking to a new date/window if there's room (used by admin approve/reschedule).
create or replace function public.move_booking(b_id uuid, d date, w text, new_status text, note text) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare r public.bookings;
begin
  if d is not null then
    perform pg_advisory_xact_lock(hashtext('ci-day-' || d::text));
    if not public.window_fits(d, w, b_id) then raise exception 'date_full' using errcode = 'P0001'; end if;
  end if;
  update public.bookings set service_date = d, time_window = w, status = coalesce(new_status, status),
    history = history || jsonb_build_array(jsonb_build_object('at', now(), 'event', note, 'status', coalesce(new_status, status), 'date', d, 'window', w))
  where id = b_id returning * into r;
  return r;
end $$;

-- Only the backend (service role) may call these.
revoke all on function public.reserve_booking(jsonb) from public, anon, authenticated;
revoke all on function public.move_booking(uuid, date, text, text, text) from public, anon, authenticated;
revoke all on function public.get_availability(date, date) from public, anon, authenticated;
revoke all on function public.day_capacity(date, uuid) from public, anon;
revoke all on function public.window_fits(date, text, uuid) from public, anon;

-- ---------- row level security: nothing is public; admins can manage everything ----------
alter table public.settings enable row level security;
alter table public.services enable row level security;
alter table public.discounts enable row level security;
alter table public.blackout_dates enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.rate_events enable row level security;
alter table public.admins enable row level security;

do $$ declare t text; begin
  foreach t in array array['settings','services','discounts','blackout_dates','bookings'] loop
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;
drop policy if exists admin_read on public.payments;
create policy admin_read on public.payments for select to authenticated using (public.is_admin());
drop policy if exists admin_self on public.admins;
create policy admin_self on public.admins for select to authenticated using (user_id = auth.uid());

-- ---------- photo storage (private) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('booking-photos', 'booking-photos', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;
drop policy if exists "admins read photos" on storage.objects;
create policy "admins read photos" on storage.objects for select to authenticated using (bucket_id = 'booking-photos' and public.is_admin());

-- ---------- starting data (prices can be changed later in /admin) ----------
insert into public.settings (id, data) values (1, '{
  "timezone": "America/New_York", "season_start": "04-01", "season_end": "10-31",
  "working_days": [1,2,3,4,5,6], "extra_open_dates": [], "offseason_open": false, "crews": 2, "min_lead_days": 2, "max_advance_days": 400,
  "order_minimum": 150, "deposit": 50, "instant_max": 450, "full_day_threshold": 350,
  "bundle_2_pct": 7, "bundle_3_pct": 12, "zone2_fee": 25, "cancel_hours": 48
}') on conflict (id) do nothing;

insert into public.services (id, name, category, kind, unit, unit_label, rate, min_price, sort) values
 ('house_wash','House wash: vinyl or aluminum siding','house-washing','main','sqft','home sq ft',0.15,249,10),
 ('brick_wash','House wash: brick, stone or stucco','house-washing','main','sqft','home sq ft',0.18,279,20),
 ('driveway','Driveway: concrete','driveway-cleaning','main','sqft','sq ft',0.22,0,30),
 ('pavers','Driveway or patio: pavers','driveway-cleaning','main','sqft','sq ft',0.28,0,40),
 ('patio_walk','Patio or walkway: concrete or stone','patio-walkway-cleaning','main','sqft','sq ft',0.25,0,50),
 ('pool_deck','Pool deck','patio-walkway-cleaning','main','sqft','sq ft',0.25,0,60),
 ('porch_steps','Front porch, entry and steps','patio-walkway-cleaning','main','flat','entry',85,0,70),
 ('deck','Deck: wood or composite','deck-fence-cleaning','main','sqft','sq ft',0.40,175,80),
 ('fence','Fence: vinyl or wood, per side','deck-fence-cleaning','main','lf','linear ft',1.75,0,90),
 ('windows','Exterior window cleaning','windows-gutters-doors','main','each','window',8,80,100),
 ('gutter_face','Gutter and fascia exterior wash','windows-gutters-doors','main','lf','linear ft',1.00,100,110),
 ('garage_door','Garage door','windows-gutters-doors','main','each','door',35,0,120),
 ('shed','Shed exterior','yard-extras','main','each','shed',85,0,130),
 ('play_set','Play set or swing set','yard-extras','main','each','set',95,0,140),
 ('furniture','Outdoor furniture','yard-extras','main','each','piece',12,40,150),
 ('trash_bins','Trash and recycling bins','yard-extras','addon','each','bin',20,0,160),
 ('mailbox','Mailbox and post','yard-extras','addon','each','mailbox',15,0,170),
 ('oil_stain','Oil or rust spot pre-treatment','driveway-cleaning','addon','each','spot',30,0,180)
on conflict (id) do nothing;

-- ---------- LAST STEP: make yourself the admin ----------
-- 1) Authentication > Users > Add user > Create new user (your email + a strong password, tick "Auto Confirm User").
-- 2) Put your email below, highlight just the next line, and click Run:
-- insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
