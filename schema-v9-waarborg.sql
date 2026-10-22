-- ============================================================
-- Maison Moments — schema v9: waarborg per concept of thema
--
-- Uitvoeren in Supabase: SQL Editor -> New query -> plak alles -> Run.
-- Veilig om opnieuw uit te voeren. Vereist schema-v2 t/m v8.
--
-- Volgorde: thema (indien ingevuld) -> concept -> standaard in de
-- instellingen. De waarde wordt bij de aanvraag op de reservatie bewaard,
-- zodat latere wijzigingen de bestaande reservaties niet veranderen.
-- ============================================================


-- 1. WAARBORG PER CONCEPT EN PER THEMA ------------------------------
alter table concepts
  add column if not exists guarantee_amount numeric check (guarantee_amount >= 0);

alter table party_themes
  add column if not exists guarantee_amount numeric check (guarantee_amount >= 0);

-- Bestaande concepten krijgen de huidige standaardwaarde, zodat die expliciet staat.
update concepts c
set guarantee_amount = s.guarantee_amount
from booking_settings s
where s.id = 1 and c.guarantee_amount is null;


-- 2. WAARBORG BIJ DE RESERVATIE ------------------------------------
alter table reservation_requests
  add column if not exists guarantee_amount numeric check (guarantee_amount >= 0);


-- 3. CONTROLE BIJ EEN NIEUWE AANVRAAG (uitbreiding van v7) ---------
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
  select * into s from booking_settings where id = 1;
  select * into c from concepts where id = new.concept_id;

  -- waarborg vastleggen: thema, dan concept, dan de standaard
  new.guarantee_amount := coalesce(
    (select t.guarantee_amount from party_themes t where t.id = new.theme_id),
    c.guarantee_amount,
    s.guarantee_amount);

  if is_admin() then
    return new;   -- de beheerder mag alles manueel invoeren
  end if;

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
