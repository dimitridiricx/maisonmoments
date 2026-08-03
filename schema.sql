-- ============================================================
-- Maison Moments — Supabase schema
-- Plak dit volledig in Supabase: SQL Editor -> New query -> Run
-- ============================================================

-- 1. THEMA'S -----------------------------------------------------
create table if not exists themes (
  id text primary key,
  tag text not null default '',
  emoji text not null default '🎈',
  name text not null,
  description text not null default '',
  price numeric not null default 0,
  color_from text not null default '#E9DCC9',
  color_to text not null default '#D9BD97',
  tag_bg text not null default '#F1E7D6',
  tag_text text not null default '#8A6B3F',
  sort_order int not null default 0
);

alter table themes enable row level security;

create policy "Iedereen mag thema's lezen"
  on themes for select
  using (true);

create policy "Alleen ingelogde admin mag thema's wijzigen"
  on themes for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 2. ADD-ONS ------------------------------------------------------
create table if not exists add_ons (
  id text primary key,
  name text not null,
  price numeric not null default 0
);

alter table add_ons enable row level security;

create policy "Iedereen mag add-ons lezen"
  on add_ons for select
  using (true);

create policy "Alleen ingelogde admin mag add-ons wijzigen"
  on add_ons for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 3. PRIJSINSTELLINGEN (één rij, id = 1) ---------------------------
create table if not exists pricing_settings (
  id int primary key default 1,
  guests_included int not null default 8,
  guest_extra_price numeric not null default 4,
  days_included int not null default 1,
  day_extra_price numeric not null default 15
);

alter table pricing_settings enable row level security;

create policy "Iedereen mag prijsinstellingen lezen"
  on pricing_settings for select
  using (true);

create policy "Alleen ingelogde admin mag prijsinstellingen wijzigen"
  on pricing_settings for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 4. OFFERTE-AANVRAGEN (vanuit het contactformulier) ---------------
create table if not exists quote_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text,
  theme text,
  guests int,
  event_date date,
  message text
);

alter table quote_requests enable row level security;

create policy "Bezoekers mogen een aanvraag versturen"
  on quote_requests for insert
  with check (true);

create policy "Alleen ingelogde admin mag aanvragen lezen"
  on quote_requests for select
  using (auth.role() = 'authenticated');

-- ============================================================
-- 5. VOORBEELDDATA — de huidige zes thema's, add-ons en prijzen
-- ============================================================
insert into themes (id, tag, emoji, name, description, price, color_from, color_to, tag_bg, tag_text, sort_order) values
  ('t1','Sleepover','🎀','Prinsessen Droom','Roze en goud, zachte kussentjes en een sprankelende tafelstyling.',89,'#F6D9CE','#F2C4B3','#F8E3DA','#B4553B',1),
  ('t2','Verjaardag','🦁','Wild Safari','Mosgroen en terracotta met jungle-slingers en houten accenten.',79,'#D9E2C7','#C4CFAE','#E3EAD6','#5C6B45',2),
  ('t3','Verjaardag','🌈','Boho Regenboog','Vrolijke pastelkleuren, ballonbogen en handgemaakte franjes.',85,'#F1DDB0','#E3A857','#F6E7C4','#8A6420',3),
  ('t4','Sleepover','✨','Sterrennacht','Middernachtsblauw en goud met lichtjes voor een dromerige avond.',95,'#CBD3E3','#9FAEC9','#DDE3EE','#3E4C6B',4),
  ('t5','Verjaardag','🎪','Vintage Circus','Mosterdgeel en rood, gestreepte accenten en retro vaandels.',79,'#E8C9B3','#D9A98A','#F1DECB','#8A4E22',5),
  ('t6','Zomerfeest','🌿','Tropische Jungle','Salie en koraal, botanische prints en een fris zomers palet.',89,'#CFE0D6','#A9C4AE','#DFEBE3','#3F6A4F',6)
on conflict (id) do nothing;

insert into add_ons (id, name, price) values
  ('a1','Ballonnenboog',35),
  ('a2','Fotohoek',45),
  ('a3','Taarttafel styling',30)
on conflict (id) do nothing;

insert into pricing_settings (id, guests_included, guest_extra_price, days_included, day_extra_price)
values (1, 8, 4, 1, 15)
on conflict (id) do nothing;

-- 6. WACHTLIJST (voor de "coming soon"-pagina) ---------------------
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null unique
);

alter table waitlist enable row level security;

create policy "Bezoekers mogen zich aanmelden"
  on waitlist for insert
  with check (true);

create policy "Alleen ingelogde admin mag de wachtlijst lezen"
  on waitlist for select
  using (auth.role() = 'authenticated');
