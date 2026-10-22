-- ============================================================
-- Maison Moments — schema v8: foto's en video's ook per concept
--
-- Uitvoeren in Supabase: SQL Editor -> New query -> plak alles -> Run.
-- Veilig om opnieuw uit te voeren. Vereist schema-v2 t/m v7.
--
-- Een media-rij hoort bij een thema OF bij een concept. Concepten zonder
-- thema's tonen zo hun eigen galerij.
-- ============================================================


alter table theme_media alter column theme_id drop not null;

alter table theme_media
  add column if not exists concept_id uuid references concepts(id) on delete cascade;

alter table theme_media drop constraint if exists theme_media_owner_check;
alter table theme_media add constraint theme_media_owner_check
  check ((theme_id is not null) <> (concept_id is not null));

create index if not exists theme_media_concept on theme_media (concept_id, sort_order);
