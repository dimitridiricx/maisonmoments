-- ============================================================
-- Maison Moments — schema v10: optionele styling per concept of thema
--
-- Uitvoeren in Supabase: SQL Editor -> New query -> plak alles -> Run.
-- Veilig om opnieuw uit te voeren. Vereist schema-v2 t/m v9.
--
-- Styling is een tweede verplichte keuze in het boekingsformulier, enkel
-- zichtbaar als het concept (of thema) een styling-prijs heeft:
--   - tot en met styling_threshold eenheden: styling_price_low
--   - vanaf styling_threshold + 1 eenheden:  styling_price_high
-- Een thema overschrijft het concept als het veld ingevuld is.
-- ============================================================


-- 1. CONCEPTEN ------------------------------------------------------
alter table concepts
  add column if not exists styling_threshold int check (styling_threshold >= 1),
  add column if not exists styling_price_low numeric check (styling_price_low >= 0),
  add column if not exists styling_price_high numeric check (styling_price_high >= 0),
  add column if not exists styling_label text not null default 'Opbouw & styling (en afbraak)' check (length(styling_label) <= 120);

-- 2. THEMA'S (leeg = zoals het concept) -----------------------------
alter table party_themes
  add column if not exists styling_threshold int check (styling_threshold >= 1),
  add column if not exists styling_price_low numeric check (styling_price_low >= 0),
  add column if not exists styling_price_high numeric check (styling_price_high >= 0),
  add column if not exists styling_label text check (length(styling_label) <= 120);

-- Slaapfeestjes: de bedragen uit de prijslijst (één keer).
update concepts
set styling_threshold = 3,
    styling_price_low = 40,
    styling_price_high = 50
where slug = 'slaapfeestjes' and styling_price_low is null;

-- 3. RESERVATIES ----------------------------------------------------
alter table reservation_requests
  add column if not exists styling boolean not null default false,
  add column if not exists styling_price numeric check (styling_price >= 0);
