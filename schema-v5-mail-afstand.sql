-- ============================================================
-- Maison Moments — schema v5: afstand/levering en mailteksten
--
-- Uitvoeren in Supabase: SQL Editor -> New query -> plak alles -> Run.
-- Veilig om opnieuw uit te voeren. Vereist schema-v4-reservaties.sql.
-- ============================================================

-- Instellingen voor levering en betaling (aanpasbaar in de admin)
alter table booking_settings
  add column if not exists free_km numeric not null default 15 check (free_km >= 0),
  add column if not exists max_km numeric not null default 30 check (max_km >= 0),
  add column if not exists distance_surcharge numeric not null default 15 check (distance_surcharge >= 0),
  add column if not exists deposit_amount numeric not null default 40 check (deposit_amount >= 0),
  add column if not exists guarantee_amount numeric not null default 100 check (guarantee_amount >= 0),
  add column if not exists deposit_days int not null default 3 check (deposit_days >= 0),
  -- betaalgegevens voor het voorschot, komen in de bevestigingsmail (bv. rekeningnummer)
  add column if not exists payment_instructions text not null default '';

-- Afstand zoals berekend bij de aanvraag (vogelvlucht, ter indicatie)
alter table reservation_requests
  add column if not exists distance_km numeric check (distance_km is null or distance_km between 0 and 2000),
  add column if not exists delivery_surcharge numeric check (delivery_surcharge is null or delivery_surcharge between 0 and 1000);
