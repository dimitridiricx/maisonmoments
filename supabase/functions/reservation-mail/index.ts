// ------------------------------------------------------------------
// Maison Moments — mails bij reservaties
//
// Wordt aangeroepen door een Supabase Database Webhook op de tabel
// reservation_requests (INSERT en UPDATE). Stuurt een mail naar de klant,
// met een kopie (BCC) naar MAIL_COPY_TO:
//   - nieuwe aanvraag           -> "we hebben je aanvraag ontvangen"
//   - status naar 'bevestigd'   -> bevestiging + voorschot-instructies
//   - status naar 'geannuleerd' -> annulatie
//
// Geheimen (Supabase -> Edge Functions -> Secrets):
//   SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS,
//   MAIL_FROM (reservaties@maisonmoments.be), MAIL_COPY_TO (info@maisonmoments.be),
//   WEBHOOK_SECRET (zelfde waarde als de header x-webhook-secret in de webhook)
// ------------------------------------------------------------------
import nodemailer from "npm:nodemailer@6.9.16";

type Reservation = Record<string, any>;

const env = (k: string) => Deno.env.get(k) ?? "";

const transporter = nodemailer.createTransport({
  host: env("SMTP_HOST"),
  port: Number(env("SMTP_PORT") || 465),
  secure: true, // poort 465 = SSL; Supabase laat 25 en 587 niet toe
  auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS") },
});

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const euro = (n: unknown) => (n === null || n === undefined || n === "" ? "" : `€${Number(n).toLocaleString("nl-BE", { maximumFractionDigits: 2 })}`);
const yn = (v: unknown) => (v === true ? "ja" : v === false ? "nee" : "—");
const niceDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

async function settings() {
  const key = env("SUPABASE_ANON_KEY");
  const res = await fetch(`${env("SUPABASE_URL")}/rest/v1/booking_settings?id=eq.1&select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const rows = res.ok ? await res.json() : [];
  return rows[0] ?? {};
}

// Overzicht van de aanvraag, als [label, waarde]-paren
function overview(r: Reservation): [string, string][] {
  // na bevestiging: de definitieve prijs van de beheerder; anders huur + berekende toeslag
  const total = r.final_price != null ? Number(r.final_price)
    : r.quoted_price != null ? Number(r.quoted_price) + Number(r.delivery_surcharge || 0) : null;
  return [
    ["Thema", r.theme_name],
    ["Periode", `${niceDate(r.start_date)} tot ${niceDate(r.end_date)}`],
    ["Aantal tipi's", String(r.tipis)],
    ["Huurprijs", r.final_price != null ? "" : euro(r.quoted_price)],   // na bevestiging telt enkel de totaalprijs
    ["Levering", r.distance_km != null ? `± ${r.distance_km} km${Number(r.delivery_surcharge) > 0 ? ` (+${euro(r.delivery_surcharge)})` : " (inbegrepen)"}` : "wordt nog bevestigd"],
    ["Totaalprijs", total != null ? euro(total) : ""],
    ["Naam", r.name],
    ["Telefoon", r.phone],
    ["E-mail", r.email],
    ["Adres", r.address],
    ["Parkeren vlak bij de woning", yn(r.parking_near)],
    ["Laad-/parkeerplaats binnen 25 m", yn(r.loading_within_25m)],
    ["Gelijkvloers", yn(r.ground_floor)],
    ["Trappen", yn(r.has_stairs)],
    ["Lift", yn(r.has_elevator)],
    ["Opmerkingen bereikbaarheid", r.access_notes],
    ["Voorkeur levering", r.delivery_time_pref],
    ["Voorkeur ophaling", r.pickup_time_pref],
    ["Bericht", r.message],
  ].filter(([, v]) => v !== "" && v !== null && v !== undefined) as [string, string][];
}

function layout(title: string, paragraphs: string[], r: Reservation) {
  const rows = overview(r);
  const html = `<!doctype html><html lang="nl"><body style="margin:0;background:#FBF6EC;font-family:Arial,sans-serif;color:#3A2E27;">
  <div style="max-width:600px;margin:0 auto;padding:28px 20px;">
    <p style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#B98D5D;margin:0 0 6px;">Maison Moments</p>
    <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;margin:0 0 18px;">${esc(title)}</h1>
    ${paragraphs.filter(Boolean).map(p => `<p style="font-size:15px;line-height:1.6;margin:0 0 14px;">${p}</p>`).join("")}
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;font-size:14px;margin-top:10px;">
      ${rows.map(([k, v]) => `<tr><td style="padding:8px 14px;color:#6b5c4f;border-bottom:1px solid #eee;width:45%;">${esc(k)}</td><td style="padding:8px 14px;border-bottom:1px solid #eee;">${esc(v).replace(/\n/g, "<br>")}</td></tr>`).join("")}
    </table>
    <p style="font-size:13px;color:#8a7a6c;margin-top:22px;">Vragen? Antwoord gewoon op deze mail of mail naar ${esc(env("MAIL_COPY_TO"))}.</p>
  </div></body></html>`;
  const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const text = [title, "", ...paragraphs.filter(Boolean).map(strip), "", ...rows.map(([k, v]) => `${k}: ${v}`)].join("\n");
  return { html, text };
}

function compose(event: "nieuw" | "bevestigd" | "geannuleerd", r: Reservation, s: Record<string, any>) {
  const first = esc(String(r.name).split(" ")[0]);
  if (event === "nieuw") {
    return {
      subject: `We hebben je aanvraag ontvangen — ${r.theme_name}, ${niceDate(r.start_date)}`,
      ...layout("Bedankt voor je aanvraag! 🤍", [
        `Dag ${first},`,
        "We hebben je aanvraag goed ontvangen. We bekijken de beschikbaarheid en planning, en nemen zo snel mogelijk contact met je op om alles te bevestigen.",
        "Let op: dit is nog <b>geen definitieve reservatie</b>. Je ontvangt eerst een bevestiging van ons. We bevestigen de definitieve prijs samen met je reservatie.",
      ], r),
    };
  }
  if (event === "bevestigd") {
    const pay = s.payment_instructions ? esc(s.payment_instructions).replace(/\n/g, "<br>") : "We bezorgen je de betaalgegevens zo snel mogelijk.";
    const deposit = Number(s.deposit_amount ?? 40);
    const total = r.final_price != null ? Number(r.final_price) : null;
    const rest = total != null ? Math.max(0, total - deposit) : null;
    return {
      subject: `Je reservatie is bevestigd — ${r.theme_name}, ${niceDate(r.start_date)}`,
      ...layout("Je reservatie is bevestigd 🎉", [
        `Dag ${first},`,
        "Goed nieuws: we hebben je weekend voor jou vastgelegd!",
        total != null ? `De totaalprijs bedraagt <b>${euro(total)}</b>, levering, opbouw, styling, afbraak en ophaling inbegrepen.` : "",
        `Om de reservatie definitief te maken, vragen we een <b>voorschot van ${euro(deposit)}</b> binnen <b>${esc(s.deposit_days ?? 3)} dagen</b>. Het voorschot wordt verrekend met de totaalprijs.`,
        pay,
        `${rest != null ? `Het resterende bedrag van <b>${euro(rest)}</b>` : "Het resterende bedrag"} en de waarborg van <b>${euro(s.guarantee_amount ?? 100)}</b> betaal je bij levering, vóór de opbouw, via Payconiq of onmiddellijke overschrijving. De waarborg krijg je binnen 5 werkdagen terug als alles volledig en onbeschadigd is.`,
        "Zorg op de dag van de levering voor parkeergelegenheid voor de deur en een vrije, propere ruimte (ongeveer 1,5 m² per tipi).",
      ], r),
    };
  }
  return {
    subject: `Je reservatie is geannuleerd — ${r.theme_name}, ${niceDate(r.start_date)}`,
    ...layout("Je reservatie is geannuleerd", [
      `Dag ${first},`,
      "Hierbij bevestigen we dat onderstaande reservatie geannuleerd is.",
      "Heb je hier vragen over, of wil je een andere datum vastleggen? Laat het ons gerust weten.",
    ], r),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = env("WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) return new Response("Unauthorized", { status: 401 });

  let payload: { type?: string; table?: string; record?: Reservation; old_record?: Reservation };
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const r = payload.record;
  if (payload.table !== "reservation_requests" || !r) return new Response("Ignored", { status: 200 });

  let event: "nieuw" | "bevestigd" | "geannuleerd" | null = null;
  if (payload.type === "INSERT") event = "nieuw";
  else if (payload.type === "UPDATE" && payload.old_record?.status !== r.status) {
    if (r.status === "bevestigd" && payload.old_record?.status === "nieuw") event = "bevestigd";
    if (r.status === "geannuleerd") event = "geannuleerd";
  }
  if (!event) return new Response("No mail needed", { status: 200 });

  try {
    const mail = compose(event, r, await settings());
    await transporter.sendMail({
      from: `Maison Moments <${env("MAIL_FROM")}>`,
      to: r.email,
      bcc: env("MAIL_COPY_TO"),
      replyTo: env("MAIL_COPY_TO"),
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    console.log(`Mail '${event}' verstuurd voor reservatie ${r.id}`);
    return new Response("Sent", { status: 200 });
  } catch (err) {
    // geen klantgegevens in de log, enkel het id en de fout
    console.error(`Mail '${event}' mislukt voor reservatie ${r.id}:`, err instanceof Error ? err.message : err);
    return new Response("Mail failed", { status: 500 });
  }
});
