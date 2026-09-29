-- ============================================================
-- Maison Moments — schema v2: concepten, thema's, media en
-- strengere beheerdersrechten.
--
-- Uitvoeren in Supabase: SQL Editor -> New query -> plak alles -> Run.
-- Veilig om opnieuw uit te voeren.
--
-- VOORAF: vervul hieronder bij stap 1 het e-mailadres waarmee je
-- inlogt op admin.html. Zonder die regel verlies je je beheerrechten.
-- ============================================================


-- 1. BEHEERDERS ----------------------------------------------------
-- Enkel gebruikers in deze lijst mogen iets wijzigen. Voordien mocht
-- elke ingelogde gebruiker dat, ook iemand die zelf een account aanmaakte.
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table admins enable row level security;
-- geen policies: de lijst is niet leesbaar of wijzigbaar via de website

insert into admins (user_id)
select id from auth.users where email = 'VUL-HIER-JE-ADMIN-EMAIL-IN'
on conflict do nothing;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;


-- 2. BESTAANDE TABELLEN: schrijven en aanvragen lezen enkel voor admins
drop policy if exists "Alleen ingelogde admin mag thema's wijzigen" on themes;
create policy "Alleen ingelogde admin mag thema's wijzigen"
  on themes for all using (is_admin()) with check (is_admin());

drop policy if exists "Alleen ingelogde admin mag add-ons wijzigen" on add_ons;
create policy "Alleen ingelogde admin mag add-ons wijzigen"
  on add_ons for all using (is_admin()) with check (is_admin());

drop policy if exists "Alleen ingelogde admin mag prijsinstellingen wijzigen" on pricing_settings;
create policy "Alleen ingelogde admin mag prijsinstellingen wijzigen"
  on pricing_settings for all using (is_admin()) with check (is_admin());

drop policy if exists "Alleen ingelogde admin mag aanvragen lezen" on quote_requests;
create policy "Alleen ingelogde admin mag aanvragen lezen"
  on quote_requests for select using (is_admin());

drop policy if exists "Alleen ingelogde admin mag de wachtlijst lezen" on waitlist;
create policy "Alleen ingelogde admin mag de wachtlijst lezen"
  on waitlist for select using (is_admin());


-- 3. CONCEPTEN (bv. Slaapfeestjes) ----------------------------------
create table if not exists concepts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  emoji text not null default '🎈',
  tagline text not null default '',
  description text not null default '',
  cover_url text,
  color_from text not null default '#E9DCC9',
  color_to text not null default '#D9BD97',
  -- prijzen en info: gelden voor alle thema's van dit concept
  price_from numeric,
  price_unit text not null default '',
  pricing_intro text not null default '',
  pricing jsonb not null default '[]',        -- [{ "label": "2 tipi's", "price": 120 }]
  pricing_note text not null default '',
  included jsonb not null default '[]',       -- ["1 tipi per persoon", ...]
  info_sections jsonb not null default '[]',  -- [{ "title": "...", "body": "..." }]
  published boolean not null default true,
  sort_order int not null default 0
);
alter table concepts enable row level security;

drop policy if exists "Iedereen mag gepubliceerde concepten lezen" on concepts;
create policy "Iedereen mag gepubliceerde concepten lezen"
  on concepts for select using (published or is_admin());

drop policy if exists "Alleen admin mag concepten wijzigen" on concepts;
create policy "Alleen admin mag concepten wijzigen"
  on concepts for all using (is_admin()) with check (is_admin());


-- 4. THEMA'S BINNEN EEN CONCEPT (bv. Wizard's Night) ----------------
-- Prijs- en infovelden zijn optioneel: leeg = die van het concept.
create table if not exists party_themes (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references concepts(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  emoji text not null default '🎈',
  tagline text not null default '',
  description text not null default '',
  cover_url text,
  color_from text not null default '#E9DCC9',
  color_to text not null default '#D9BD97',
  price_from numeric,
  price_unit text,
  pricing_intro text,
  pricing jsonb,
  pricing_note text,
  included jsonb,
  info_sections jsonb,
  published boolean not null default true,
  sort_order int not null default 0
);
alter table party_themes enable row level security;

drop policy if exists "Iedereen mag gepubliceerde thema's lezen" on party_themes;
create policy "Iedereen mag gepubliceerde thema's lezen"
  on party_themes for select using (published or is_admin());

drop policy if exists "Alleen admin mag thema's wijzigen" on party_themes;
create policy "Alleen admin mag thema's wijzigen"
  on party_themes for all using (is_admin()) with check (is_admin());


-- 5. FOTO'S EN VIDEO'S PER THEMA -------------------------------------
create table if not exists theme_media (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references party_themes(id) on delete cascade,
  type text not null check (type in ('image', 'youtube')),
  url text not null,
  storage_path text,          -- enkel voor geüploade foto's, om ze te kunnen verwijderen
  caption text not null default '',
  sort_order int not null default 0
);
alter table theme_media enable row level security;

drop policy if exists "Iedereen mag media lezen" on theme_media;
create policy "Iedereen mag media lezen"
  on theme_media for select using (true);

drop policy if exists "Alleen admin mag media wijzigen" on theme_media;
create policy "Alleen admin mag media wijzigen"
  on theme_media for all using (is_admin()) with check (is_admin());


-- 6. OPSLAG VOOR FOTO'S ----------------------------------------------
-- Publieke bucket (iedereen kan de foto's zien), max 5 MB per foto,
-- enkel afbeeldingen. Enkel admins mogen uploaden of verwijderen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('theme-media', 'theme-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admin mag themafoto's uploaden" on storage.objects;
create policy "Admin mag themafoto's uploaden"
  on storage.objects for insert
  with check (bucket_id = 'theme-media' and is_admin());

drop policy if exists "Admin mag themafoto's wijzigen" on storage.objects;
create policy "Admin mag themafoto's wijzigen"
  on storage.objects for update
  using (bucket_id = 'theme-media' and is_admin());

drop policy if exists "Admin mag themafoto's verwijderen" on storage.objects;
create policy "Admin mag themafoto's verwijderen"
  on storage.objects for delete
  using (bucket_id = 'theme-media' and is_admin());


-- 7. STARTINHOUD: Slaapfeestjes met vijf thema's ---------------------
insert into concepts (slug, name, emoji, tagline, description, color_from, color_to,
                      price_from, price_unit, pricing_intro, pricing, pricing_note, included, info_sections, sort_order)
values (
  'slaapfeestjes', 'Slaapfeestjes', '⛺',
  'Een tipi-sleepover in jouw woonkamer, volledig gestyled in het thema van je keuze.',
  'Wij leveren op vrijdag, bouwen en stylen alles, en halen het op zondag weer op. Jullie hoeven alleen nog te genieten.',
  '#F6D9CE', '#F2C4B3',
  120, 'per weekend',
  'Alle prijzen gelden voor een volledig weekend, van vrijdagavond tot zondag, inclusief levering, opbouw, styling, afbraak en ophaling.',
  '[{"label":"2 tipi''s","price":120},{"label":"3 tipi''s","price":145},{"label":"4 tipi''s","price":170},{"label":"5 tipi''s","price":195},{"label":"6 tipi''s","price":220}]',
  'Levering binnen 15 km is inbegrepen. Van 15 tot 30 km rekenen we €15 extra.',
  '["1 tipi per persoon","1 luchtmatras per persoon","1 hoofdkussen met kussensloop","1 donsdeken met dekbedovertrek","1 extra dekentje","1 ontbijttafeltje","Themadecoratie en sfeerverlichting","Eén extra luchtmatras met elektrische pomp","Extra batterijen voor de sfeerverlichting"]',
  '[{"title":"Zo verloopt het weekend","body":"Op vrijdagavond leveren, bouwen en stylen we alles. Reken daarvoor op 1 à 2 uur, afhankelijk van het aantal tipi''s. Op zondag breken we alles af en nemen we het terug mee."},
    {"title":"Ruimte en levering","body":"Reken op ongeveer 1,5 m² vrije vloeroppervlakte per tipi. Zorg dat de ruimte vóór de levering vrij en proper is, en dat we vlak voor de deur kunnen parkeren om vlot en veilig te laden. Lukt parkeren voor de deur niet? Laat het ons vooraf weten, dan zoeken we samen een oplossing."},
    {"title":"Voorschot en betaling","body":"Na onze bevestiging betaal je binnen 3 dagen een voorschot van €40. Daarmee is je reservatie definitief; het voorschot wordt verrekend met de huurprijs. Het resterende bedrag en de waarborg van €100 betaal je bij levering, vóór de opbouw, via Payconiq of onmiddellijke overschrijving. De waarborg krijg je binnen 5 werkdagen terug als alles volledig en onbeschadigd is."},
    {"title":"Hygiëne","body":"Al het beddengoed wordt na iedere verhuur zorgvuldig gewassen."},
    {"title":"Tijdens de week of een verlengd weekend?","body":"Een slaapfeestje in de schoolvakantie of tijdens een verlengd weekend is ook mogelijk. We bekijken het graag samen met jou."}]',
  1
)
on conflict (slug) do nothing;

insert into party_themes (concept_id, slug, name, emoji, tagline, description, color_from, color_to, sort_order)
select c.id, v.slug, v.name, v.emoji, v.tagline, v.description, v.color_from, v.color_to, v.sort_order
from concepts c
cross join (values
  ('wizards-night', 'Wizard''s Night', '🪄', 'Toverstokken, uilen en een sterrenhemel vol magie.',
   'Een betoverende nacht vol toverspreuken, kaarslicht en geheimzinnige details. Perfect voor kleine tovenaars en heksen.', '#CBD3E3', '#9FAEC9', 1),
  ('space-explorer', 'Space Explorer', '🚀', 'Een reis langs planeten, raketten en sterren.',
   'Klaar voor lancering! Tipi''s vol sterrenlichtjes en planeten voor een nacht tussen de sterren.', '#D5D3E6', '#8E8BB8', 2),
  ('over-the-rainbow', 'Over the Rainbow', '🌈', 'Zachte pasteltinten en vrolijke regenbogen.',
   'Een kleurrijk en dromerig thema met pastelkleuren, wolkjes en regenbogen.', '#F1DDB0', '#E3A857', 3),
  ('mermaids-magic', 'Mermaids Magic', '🧜‍♀️', 'Schelpen, glitters en de magie van de zee.',
   'Duik in een onderwaterwereld vol zeemeerminnen, schelpen en parelmoerglans.', '#CFE0D6', '#A9C4AE', 4),
  ('the-equestrian-club', 'The Equestrian Club', '🐴', 'Voor echte paardenliefhebbers.',
   'Rozetten, hoefijzers en warme natuurtinten voor een stijlvolle paardenpyjamaparty.', '#E8C9B3', '#D9A98A', 5)
) as v(slug, name, emoji, tagline, description, color_from, color_to, sort_order)
where c.slug = 'slaapfeestjes'
on conflict (slug) do nothing;
