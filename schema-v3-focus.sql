-- ============================================================
-- Maison Moments — schema v3: focuspunt voor foto's
-- Bepaalt welk deel van een foto zichtbaar blijft in tegels en
-- in de galerij (0-100 %, 50/50 = midden).
--
-- Uitvoeren in Supabase: SQL Editor -> New query -> plak alles -> Run.
-- Veilig om opnieuw uit te voeren.
-- ============================================================

alter table theme_media
  add column if not exists focus_x numeric not null default 50 check (focus_x between 0 and 100),
  add column if not exists focus_y numeric not null default 50 check (focus_y between 0 and 100);

alter table concepts
  add column if not exists cover_focus_x numeric not null default 50 check (cover_focus_x between 0 and 100),
  add column if not exists cover_focus_y numeric not null default 50 check (cover_focus_y between 0 and 100);
