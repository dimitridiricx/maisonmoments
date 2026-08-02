/* ------------------------------------------------------------------
   Supabase-configuratie voor Maison Moments
   ------------------------------------------------------------------
   1. Maak een gratis project aan op https://supabase.com
   2. Ga naar Project Settings -> API
   3. Plak hieronder de "Project URL" en de "anon public" key
   4. Upload dit bestand samen met index.html en admin.html naar
      dezelfde map op je hosting (Combell)

   Gebruik NOOIT de "service_role" key hier — die hoort alleen op een
   beveiligde server thuis, niet in een bestand dat iedereen kan lezen.
------------------------------------------------------------------- */

const SUPABASE_URL = "https://htesncvgvnjgcbgnoonh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0ZXNuY3Zndm5qZ2NiZ25vb25oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NjkyNTcsImV4cCI6MjEwMTI0NTI1N30.oYbL8m_npz5TkSHIvAl8rCSMUPBTHKGLIN_gSmizgtM";

let supabaseClient = null;
if (SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 20) {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.warn("Supabase is nog niet geconfigureerd — vul supabase-config.js in.");
}
