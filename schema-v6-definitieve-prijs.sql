-- ============================================================
-- Maison Moments — schema v6: definitieve prijs bij bevestiging
-- De beheerder legt bij het bevestigen de definitieve totaalprijs vast
-- (huur + levering); die komt in de bevestigingsmail.
--
-- Uitvoeren in Supabase: SQL Editor -> New query -> plak alles -> Run.
-- Veilig om opnieuw uit te voeren.
-- ============================================================

alter table reservation_requests
  add column if not exists final_price numeric check (final_price is null or final_price between 0 and 100000);

-- Bezoekers mogen de definitieve prijs niet zelf invullen.
drop policy if exists "Bezoekers mogen een reservatie aanvragen" on reservation_requests;
create policy "Bezoekers mogen een reservatie aanvragen"
  on reservation_requests for insert
  with check (status = 'nieuw' and admin_note = '' and final_price is null);
