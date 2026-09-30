// ------------------------------------------------------------------
// Maison Moments — afstand tot het feestadres (vogelvlucht)
//
// POST { "address": "Kerkstraat 1, 9000 Gent" }
//  -> { "km": 12.4, "zone": "free" | "extra" | "out", "surcharge": 0 }
//
// Het vertrekpunt staat enkel als geheim in Supabase (ORIGIN_LAT/ORIGIN_LNG)
// en wordt nooit teruggestuurd. Adressen worden omgezet via OpenStreetMap
// (Nominatim); hun gebruiksregels vragen een herkenbare User-Agent en
// geen zoekopdracht per toetsaanslag (de website vraagt pas na invullen).
//
// Geheimen: ORIGIN_LAT, ORIGIN_LNG, ALLOWED_ORIGINS (komma-gescheiden),
//           SUPABASE_URL en SUPABASE_ANON_KEY (automatisch aanwezig).
// ------------------------------------------------------------------

const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map(s => s.trim()).filter(Boolean);

function cors(origin: string | null) {
  const ok = origin && allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0] ?? "",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

// afstand in km tussen twee punten op aarde
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

async function settings() {
  const url = `${Deno.env.get("SUPABASE_URL")}/rest/v1/booking_settings?id=eq.1&select=free_km,max_km,distance_surcharge`;
  const key = Deno.env.get("SUPABASE_ANON_KEY")!;
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const rows = res.ok ? await res.json() : [];
  return rows[0] ?? { free_km: 15, max_km: 30, distance_surcharge: 15 };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Methode niet toegestaan" }, 405, origin);
  if (allowed.length && (!origin || !allowed.includes(origin))) return json({ error: "Niet toegestaan" }, 403, origin);

  let address = "";
  try {
    address = String((await req.json()).address ?? "").trim();
  } catch {
    return json({ error: "Ongeldige aanvraag" }, 400, origin);
  }
  if (address.length < 5 || address.length > 300) return json({ error: "Ongeldig adres" }, 400, origin);

  const originLat = Number(Deno.env.get("ORIGIN_LAT"));
  const originLng = Number(Deno.env.get("ORIGIN_LNG"));
  if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
    console.error("ORIGIN_LAT/ORIGIN_LNG ontbreken");
    return json({ error: "Afstand kan nu niet berekend worden" }, 500, origin);
  }

  try {
    const q = new URLSearchParams({ q: address, format: "jsonv2", limit: "1", countrycodes: "be" });
    const geo = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, {
      headers: { "User-Agent": "MaisonMoments-reservaties/1.0 (info@maisonmoments.be)", "Accept-Language": "nl" },
    });
    if (!geo.ok) throw new Error(`Nominatim ${geo.status}`);
    const hits = await geo.json();
    if (!hits.length) return json({ found: false }, 200, origin);

    const km = Math.round(haversine(originLat, originLng, Number(hits[0].lat), Number(hits[0].lon)) * 10) / 10;
    const s = await settings();
    const zone = km <= s.free_km ? "free" : km <= s.max_km ? "extra" : "out";
    return json({ found: true, km, zone, surcharge: zone === "extra" ? Number(s.distance_surcharge) : 0 }, 200, origin);
  } catch (err) {
    console.error(err);
    return json({ error: "Afstand kan nu niet berekend worden" }, 502, origin);
  }
});
