-- ============================================================
-- Maison Moments — schema v4: beschikbaarheid en reservatie-aanvragen
--
-- Uitvoeren in Supabase: SQL Editor -> New query -> plak alles -> Run.
-- Veilig om opnieuw uit te voeren. Vereist schema-v2.sql (is_admin).
-- ============================================================


-- 1. INSTELLINGEN (één rij, id = 1) --------------------------------
create table if not exists booking_settings (
  id int primary key default 1 check (id = 1),
  total_tipis int not null default 6 check (total_tipis >= 0),
  min_tipis int not null default 2 check (min_tipis >= 1),
  months_ahead int not null default 12 check (months_ahead between 1 and 24),
  min_days_notice int not null default 7 check (min_days_notice >= 0)
);
alter table booking_settings enable row level security;

drop policy if exists "Iedereen mag reservatie-instellingen lezen" on booking_settings;
create policy "Iedereen mag reservatie-instellingen lezen"
  on booking_settings for select using (true);

drop policy if exists "Alleen admin mag reservatie-instellingen wijzigen" on booking_settings;
create policy "Alleen admin mag reservatie-instellingen wijzigen"
  on booking_settings for all using (is_admin()) with check (is_admin());

insert into booking_settings (id) values (1) on conflict (id) do nothing;


-- 2. PERIODES: vakanties openzetten of weekends blokkeren ------------
create table if not exists availability_periods (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('open', 'blocked')),
  start_date date not null,
  end_date date not null,
  note text not null default '',
  check (end_date >= start_date)
);
alter table availability_periods enable row level security;

drop policy if exists "Iedereen mag periodes lezen" on availability_periods;
create policy "Iedereen mag periodes lezen"
  on availability_periods for select using (true);

drop policy if exists "Alleen admin mag periodes wijzigen" on availability_periods;
create policy "Alleen admin mag periodes wijzigen"
  on availability_periods for all using (is_admin()) with check (is_admin());


-- 3. RESERVATIE-AANVRAGEN --------------------------------------------
-- Status: nieuw -> bevestigd -> voorschot_betaald (of geweigerd / geannuleerd).
-- Enkel 'bevestigd' en 'voorschot_betaald' tellen mee in de kalender.
create table if not exists reservation_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'nieuw'
    check (status in ('nieuw', 'bevestigd', 'voorschot_betaald', 'geweigerd', 'geannuleerd')),
  theme_id uuid references party_themes(id) on delete set null,
  theme_name text not null default '',
  start_date date not null,
  end_date date not null,
  tipis int not null check (tipis between 1 and 20),
  quoted_price numeric,
  -- contact
  name text not null check (length(name) between 2 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  phone text not null check (length(phone) between 6 and 40),
  address text not null check (length(address) between 5 and 300),
  -- bereikbaarheid
  parking_near boolean,
  loading_within_25m boolean,
  ground_floor boolean,
  has_stairs boolean,
  has_elevator boolean,
  access_notes text not null default '' check (length(access_notes) <= 2000),
  -- levering en ophaling
  delivery_time_pref text not null default '' check (length(delivery_time_pref) <= 100),
  pickup_time_pref text not null default '' check (length(pickup_time_pref) <= 100),
  message text not null default '' check (length(message) <= 2000),
  privacy_accepted boolean not null check (privacy_accepted),
  -- enkel voor de beheerder
  admin_note text not null default '',
  check (end_date = start_date + 2)
);
alter table reservation_requests enable row level security;

create index if not exists reservation_requests_dates on reservation_requests (start_date, end_date);

-- Bezoekers mogen enkel een nieuwe aanvraag indienen, niets lezen.
drop policy if exists "Bezoekers mogen een reservatie aanvragen" on reservation_requests;
create policy "Bezoekers mogen een reservatie aanvragen"
  on reservation_requests for insert
  with check (status = 'nieuw' and admin_note = '');

drop policy if exists "Alleen admin mag reservaties lezen" on reservation_requests;
create policy "Alleen admin mag reservaties lezen"
  on reservation_requests for select using (is_admin());

drop policy if exists "Alleen admin mag reservaties wijzigen" on reservation_requests;
create policy "Alleen admin mag reservaties wijzigen"
  on reservation_requests for update using (is_admin()) with check (is_admin());

drop policy if exists "Alleen admin mag reservaties verwijderen" on reservation_requests;
create policy "Alleen admin mag reservaties verwijderen"
  on reservation_requests for delete using (is_admin());


-- 4. BESCHIKBAARHEID PER DAG -----------------------------------------
-- Geeft per dag: hoeveel tipi's bevestigd geboekt zijn, en of de dag
-- geblokkeerd of extra opengezet is. Toont GEEN klantgegevens, zodat
-- de website dit mag opvragen zonder de aanvragen zelf te kunnen lezen.
create or replace function get_availability(from_date date, to_date date)
returns table (day date, booked int, blocked boolean, opened boolean)
language sql
stable
security definer
set search_path = public
as $$
  select d::date,
         coalesce((select sum(r.tipis) from reservation_requests r
                   where r.status in ('bevestigd', 'voorschot_betaald')
                     and d::date between r.start_date and r.end_date), 0)::int,
         exists (select 1 from availability_periods p
                 where p.kind = 'blocked' and d::date between p.start_date and p.end_date),
         exists (select 1 from availability_periods p
                 where p.kind = 'open' and d::date between p.start_date and p.end_date)
  from generate_series(from_date, least(to_date, from_date + 800), interval '1 day') d;
$$;

revoke all on function get_availability(date, date) from public;
grant execute on function get_availability(date, date) to anon, authenticated;


-- 5. CONTROLE BIJ EEN NIEUWE AANVRAAG --------------------------------
-- Weigert aanvragen die niet kunnen: verleden, te kort op voorhand,
-- geen weekend of opengezette periode, geblokkeerd, te veel tipi's,
-- of te veel aanvragen vanaf hetzelfde e-mailadres (spam).
create or replace function check_reservation_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s booking_settings;
  free_tipis int;
begin
  if is_admin() then
    return new;   -- de beheerder mag alles manueel invoeren
  end if;

  select * into s from booking_settings where id = 1;

  if new.start_date < current_date + s.min_days_notice then
    raise exception 'Deze datum is te kort op voorhand.';
  end if;
  if new.start_date > current_date + make_interval(months => s.months_ahead) then
    raise exception 'Deze datum ligt te ver in de toekomst.';
  end if;
  if new.tipis < s.min_tipis then
    raise exception 'Minimum % tipi''s.', s.min_tipis;
  end if;

  -- start op vrijdag, of alle drie de dagen in een opengezette periode
  if extract(isodow from new.start_date) <> 5 and not exists (
       select 1 from availability_periods p
       where p.kind = 'open' and new.start_date >= p.start_date and new.end_date <= p.end_date) then
    raise exception 'Deze periode is niet boekbaar.';
  end if;

  if exists (select 1 from get_availability(new.start_date, new.end_date) a where a.blocked) then
    raise exception 'Deze periode is niet beschikbaar.';
  end if;

  select s.total_tipis - max(a.booked) into free_tipis
  from get_availability(new.start_date, new.end_date) a;
  if new.tipis > free_tipis then
    raise exception 'Er zijn nog maar % tipi''s vrij in deze periode.', greatest(free_tipis, 0);
  end if;

  if (select count(*) from reservation_requests r
      where lower(r.email) = lower(new.email) and r.created_at > now() - interval '1 day') >= 3 then
    raise exception 'Je hebt vandaag al meerdere aanvragen verstuurd. Neem gerust contact met ons op.';
  end if;

  -- velden die enkel de beheerder mag bepalen
  new.status := 'nieuw';
  new.admin_note := '';
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists check_reservation_request on reservation_requests;
create trigger check_reservation_request
  before insert on reservation_requests
  for each row execute function check_reservation_request();
