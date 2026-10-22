-- ============================================================
-- Maison Moments — schema v7: capaciteit per concept, optionele thema's
--
-- Uitvoeren in Supabase: SQL Editor -> New query -> plak alles -> Run.
-- Veilig om opnieuw uit te voeren. Vereist schema-v2 t/m v6.
--
-- Gevolg: de beschikbaarheid wordt per concept berekend. Tipi's van de
-- slaapfeestjes tellen niet meer mee bij de andere concepten.
-- ============================================================


-- 1. CONCEPTEN: voorraad, eenheid, boekingsgrootte en thema's ja/nee --
alter table concepts
  add column if not exists has_themes boolean not null default true,
  add column if not exists capacity int not null default 0 check (capacity >= 0),
  add column if not exists capacity_unit text not null default 'tipi''s' check (length(capacity_unit) between 1 and 40),
  add column if not exists booking_min int not null default 1 check (booking_min >= 1),
  add column if not exists booking_max int not null default 1 check (booking_max >= booking_min);

-- Slaapfeestjes: de bestaande globale instellingen overnemen (één keer).
update concepts c
set capacity = s.total_tipis,
    booking_min = s.min_tipis,
    booking_max = s.total_tipis,
    capacity_unit = 'tipi''s'
from booking_settings s
where s.id = 1 and c.slug = 'slaapfeestjes' and c.capacity = 0;


-- 2. RESERVATIES: concept en eenheid bewaren -------------------------
alter table reservation_requests
  add column if not exists concept_id uuid references concepts(id) on delete set null,
  add column if not exists unit text not null default 'tipi''s' check (length(unit) <= 40);

alter table reservation_requests drop constraint if exists reservation_requests_tipis_check;
alter table reservation_requests add constraint reservation_requests_tipis_check check (tipis between 1 and 50);

-- Bestaande reservaties koppelen aan het concept van hun thema.
update reservation_requests r
set concept_id = t.concept_id
from party_themes t
where r.theme_id = t.id and r.concept_id is null;

create index if not exists reservation_requests_concept on reservation_requests (concept_id, start_date, end_date);


-- 3. BESCHIKBAARHEID PER CONCEPT -------------------------------------
drop function if exists get_availability(date, date);

create or replace function get_availability(p_concept uuid, from_date date, to_date date)
returns table (day date, booked int, blocked boolean, opened boolean)
language sql
stable
security definer
set search_path = public
as $$
  select d::date,
         coalesce((select sum(r.tipis) from reservation_requests r
                   where r.status in ('bevestigd', 'voorschot_betaald')
                     and r.concept_id = p_concept
                     and d::date between r.start_date and r.end_date), 0)::int,
         exists (select 1 from availability_periods p
                 where p.kind = 'blocked' and d::date between p.start_date and p.end_date),
         exists (select 1 from availability_periods p
                 where p.kind = 'open' and d::date between p.start_date and p.end_date)
  from generate_series(from_date, least(to_date, from_date + 800), interval '1 day') d;
$$;

revoke all on function get_availability(uuid, date, date) from public;
grant execute on function get_availability(uuid, date, date) to anon, authenticated;


-- 4. CONTROLE BIJ EEN NIEUWE AANVRAAG --------------------------------
-- Zelfde regels als in v4, maar de voorraad en de boekingsgrootte komen
-- van het concept. De eenheid wordt door de server bepaald.
create or replace function check_reservation_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s booking_settings;
  c concepts;
  free_tipis int;
begin
  if is_admin() then
    return new;   -- de beheerder mag alles manueel invoeren
  end if;

  select * into s from booking_settings where id = 1;
  select * into c from concepts where id = new.concept_id;
  if c.id is null then
    raise exception 'Kies een geldig concept.';
  end if;

  if new.start_date < current_date + s.min_days_notice then
    raise exception 'Deze datum is te kort op voorhand.';
  end if;
  if new.start_date > current_date + make_interval(months => s.months_ahead) then
    raise exception 'Deze datum ligt te ver in de toekomst.';
  end if;
  if new.tipis < c.booking_min or new.tipis > c.booking_max then
    raise exception 'Je kan er tussen % en % boeken.', c.booking_min, c.booking_max;
  end if;

  -- start op vrijdag, of alle drie de dagen in een opengezette periode
  if extract(isodow from new.start_date) <> 5 and not exists (
       select 1 from availability_periods p
       where p.kind = 'open' and new.start_date >= p.start_date and new.end_date <= p.end_date) then
    raise exception 'Deze periode is niet boekbaar.';
  end if;

  if exists (select 1 from get_availability(new.concept_id, new.start_date, new.end_date) a where a.blocked) then
    raise exception 'Deze periode is niet beschikbaar.';
  end if;

  select c.capacity - max(a.booked) into free_tipis
  from get_availability(new.concept_id, new.start_date, new.end_date) a;
  if new.tipis > free_tipis then
    raise exception 'Er zijn nog maar % % vrij in deze periode.', greatest(free_tipis, 0), c.capacity_unit;
  end if;

  if (select count(*) from reservation_requests r
      where lower(r.email) = lower(new.email) and r.created_at > now() - interval '1 day') >= 3 then
    raise exception 'Je hebt vandaag al meerdere aanvragen verstuurd. Neem gerust contact met ons op.';
  end if;

  -- velden die enkel de beheerder mag bepalen
  new.status := 'nieuw';
  new.admin_note := '';
  new.created_at := now();
  new.unit := c.capacity_unit;
  return new;
end;
$$;

-- De globale tipi-instellingen zitten nu op het concept.
alter table booking_settings drop column if exists total_tipis;
alter table booking_settings drop column if exists min_tipis;
