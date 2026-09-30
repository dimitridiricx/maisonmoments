/* ------------------------------------------------------------------
   Maison Moments — beheer van reservaties en beschikbaarheid (admin.html)

   - Reservatie-aanvragen opvolgen: bevestigen, voorschot ontvangen,
     weigeren of annuleren. Enkel 'bevestigd' en 'voorschot betaald'
     tellen mee in de kalender op de website.
   - Instellingen: aantal tipi's, minimum per boeking, termijnen.
   - Periodes: vakanties openzetten of weekends blokkeren.

   Alle tekst gaat via .value / .textContent in de pagina (geen innerHTML),
   zodat wat klanten invullen geen code kan uitvoeren.
------------------------------------------------------------------- */
const Bookings = (() => {
  const STATUS = {
    nieuw: { label: "Nieuw", cls: "st-new" },
    bevestigd: { label: "Bevestigd — wacht op voorschot", cls: "st-ok" },
    voorschot_betaald: { label: "Voorschot betaald — definitief", cls: "st-paid" },
    geweigerd: { label: "Geweigerd", cls: "st-off" },
    geannuleerd: { label: "Geannuleerd", cls: "st-off" }
  };
  const FILTERS = [
    { key: "open", label: "Te behandelen", match: r => r.status === "nieuw" },
    { key: "upcoming", label: "Komende feestjes", match: r => ["bevestigd", "voorschot_betaald"].includes(r.status) && r.end_date >= todayIso() },
    { key: "archive", label: "Archief", match: r => ["geweigerd", "geannuleerd"].includes(r.status) || r.end_date < todayIso() },
    { key: "all", label: "Alles", match: () => true }
  ];

  let requests = [], periods = [], settings = null, filter = "open";
  let els = {};

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : v);
    }
    children.flat().forEach(c => c !== null && c !== undefined && c !== false && node.append(c));
    return node;
  }
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const niceDate = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); };
  const yn = v => (v === true ? "ja" : v === false ? "nee" : "—");
  const setStatus = (node, text, isError) => { node.textContent = text; node.className = isError ? "status err" : "status"; };

  /* ---------------- reservaties ---------------- */
  async function freeTipis(r) {
    const { data, error } = await supabaseClient.rpc("get_availability", { from_date: r.start_date, to_date: r.end_date });
    if (error || !data) return null;
    return settings.total_tipis - Math.max(...data.map(d => d.booked));
  }

  const euro = n => `€${Number(n).toLocaleString("nl-BE", { maximumFractionDigits: 2 })}`;
  const suggestedTotal = r => (r.quoted_price != null ? Number(r.quoted_price) + Number(r.delivery_surcharge || 0) : null);

  // price = { distance_km, delivery_surcharge, final_price } zoals ingevuld in het prijsblok
  async function changeStatus(r, next, statusNode, price) {
    const update = { status: next };
    if (next === "bevestigd" && r.status === "nieuw") {
      const free = await freeTipis(r);
      if (free !== null && r.tipis > free &&
          !confirm(`Let op: er zijn nog maar ${Math.max(free, 0)} tipi's vrij in deze periode, deze aanvraag vraagt er ${r.tipis}. Toch bevestigen?`)) return;
      if (price.final_price == null || price.final_price === "" || Number.isNaN(Number(price.final_price))) {
        return setStatus(statusNode, "Vul eerst de definitieve totaalprijs in", true);
      }
      if (!confirm(`Bevestigen aan ${euro(price.final_price)}? De klant krijgt een bevestigingsmail met dit bedrag.`)) return;
      // prijs en status samen opslaan, zodat de bevestigingsmail de juiste prijs bevat
      Object.assign(update, {
        final_price: Number(price.final_price),
        distance_km: price.distance_km === "" || price.distance_km == null ? null : Number(price.distance_km),
        delivery_surcharge: price.delivery_surcharge === "" || price.delivery_surcharge == null ? null : Number(price.delivery_surcharge)
      });
    }
    if (["geweigerd", "geannuleerd"].includes(next) && !confirm(`Deze reservatie op "${STATUS[next].label.toLowerCase()}" zetten?`)) return;
    setStatus(statusNode, "Opslaan…");
    const { error } = await supabaseClient.from("reservation_requests").update(update).eq("id", r.id);
    if (error) { console.error(error); return setStatus(statusNode, "Opslaan mislukt", true); }
    Object.assign(r, update);
    renderRequests();
  }

  // Prijsblok: afstand, toeslag en definitieve prijs (aanpasbaar zolang niet bevestigd)
  function priceBlock(r, price, statusNode) {
    const locked = r.status !== "nieuw";
    const input = (key, label, step) => {
      const i = el("input", { type: "number", min: 0, step, disabled: locked });
      i.value = price[key] ?? "";
      i.addEventListener("input", () => {
        price[key] = i.value;
        // toeslag gewijzigd -> voorgestelde totaalprijs mee aanpassen, tenzij zelf ingevuld
        if (key === "delivery_surcharge" && !price._manualTotal && r.quoted_price != null) {
          price.final_price = Number(r.quoted_price) + Number(i.value || 0);
          totalInput.value = price.final_price;
        }
        if (key === "final_price") price._manualTotal = true;
      });
      return el("div", {}, el("label", { text: label }), i);
    };
    const total = input("final_price", "Definitieve totaalprijs (€)", 1);
    const totalInput = total.querySelector("input");
    return el("div", { class: "res-price" },
      input("distance_km", "Afstand (km)", 0.1),
      input("delivery_surcharge", "Leveringstoeslag (€)", 1),
      total,
      el("small", { class: "help", text: locked
        ? "Vastgelegd bij de bevestiging."
        : `Huur volgens formulier: ${r.quoted_price != null ? euro(r.quoted_price) : "—"}. Pas aan waar nodig; dit bedrag komt in de bevestigingsmail.` }));
  }

  function requestCard(r) {
    const statusNode = el("span", { class: "status" });
    const price = {
      distance_km: r.distance_km,
      delivery_surcharge: r.delivery_surcharge,
      final_price: r.final_price ?? suggestedTotal(r)
    };
    const note = el("textarea", { rows: 2, placeholder: "Interne notitie (enkel zichtbaar voor jou), bv. afstand, afspraken…" });
    note.value = r.admin_note || "";
    note.addEventListener("change", async () => {
      const { error } = await supabaseClient.from("reservation_requests").update({ admin_note: note.value }).eq("id", r.id);
      if (!error) r.admin_note = note.value;
      setStatus(statusNode, error ? "Notitie opslaan mislukt" : "Notitie opgeslagen ✓", !!error);
    });

    const actions = {
      nieuw: [["bevestigd", "Bevestigen", "btn-coral"], ["geweigerd", "Weigeren", "btn-ghost"]],
      bevestigd: [["voorschot_betaald", "Voorschot ontvangen", "btn-coral"], ["geannuleerd", "Annuleren", "btn-ghost"], ["nieuw", "Terug naar nieuw", "btn-ghost"]],
      voorschot_betaald: [["geannuleerd", "Annuleren", "btn-ghost"], ["bevestigd", "Voorschot toch niet ontvangen", "btn-ghost"]],
      geweigerd: [["nieuw", "Terug naar nieuw", "btn-ghost"]],
      geannuleerd: [["nieuw", "Terug naar nieuw", "btn-ghost"]]
    }[r.status] || [];

    const mail = el("a", { href: `mailto:${encodeURIComponent(r.email).replace(/%40/g, "@")}`, text: r.email });
    const tel = el("a", { href: `tel:${r.phone.replace(/[^\d+]/g, "")}`, text: r.phone });
    const st = STATUS[r.status] || { label: r.status, cls: "" };

    return el("div", { class: "res-item" },
      el("div", { class: "res-top" },
        el("div", {},
          el("div", { class: "res-dates", text: `${niceDate(r.start_date)} → ${niceDate(r.end_date)}` }),
          el("div", { class: "res-what", text: `${r.theme_name || "Thema onbekend"} · ${r.tipis} tipi's${r.final_price != null ? ` · ${euro(r.final_price)}` : r.quoted_price != null ? ` · ${euro(r.quoted_price)} huur` : ""}` })),
        el("span", { class: `res-status ${st.cls}`, text: st.label })),
      el("div", { class: "res-grid" },
        el("div", {},
          el("b", { text: r.name }), el("br"), mail, el("br"), tel, el("br"),
          el("span", { text: r.address }),
          r.distance_km != null && el("div", { class: "res-distance",
            text: `± ${r.distance_km} km vogelvlucht${Number(r.delivery_surcharge) > 0 ? ` · levering +€${r.delivery_surcharge}` : " · levering inbegrepen"}` })),
        el("div", { class: "res-access" },
          el("div", { text: `Parkeren vlakbij: ${yn(r.parking_near)} · Laadplaats ≤ 25 m: ${yn(r.loading_within_25m)}` }),
          el("div", { text: `Gelijkvloers: ${yn(r.ground_floor)} · Trappen: ${yn(r.has_stairs)} · Lift: ${yn(r.has_elevator)}` }),
          r.delivery_time_pref && el("div", { text: `Levering: ${r.delivery_time_pref}` }),
          r.pickup_time_pref && el("div", { text: `Ophaling: ${r.pickup_time_pref}` }))),
      r.access_notes && el("p", { class: "res-msg", text: `Bereikbaarheid: ${r.access_notes}` }),
      r.message && el("p", { class: "res-msg", text: `Bericht: ${r.message}` }),
      priceBlock(r, price, statusNode),
      note,
      el("div", { class: "row-actions" },
        el("span", { class: "res-created", text: `Aangevraagd op ${new Date(r.created_at).toLocaleString("nl-BE")}` }),
        statusNode,
        ...actions.map(([next, label, cls]) => el("button", { class: `btn ${cls} btn-sm`, type: "button", text: label,
          onclick: () => changeStatus(r, next, statusNode, price) })))
    );
  }

  function renderRequests() {
    const f = FILTERS.find(x => x.key === filter);
    const list = requests.filter(f.match).sort((a, b) =>
      filter === "open" ? a.created_at.localeCompare(b.created_at) : a.start_date.localeCompare(b.start_date));
    els.requests.replaceChildren(
      el("div", { class: "res-tabs" }, ...FILTERS.map(x => el("button", {
        type: "button", class: `btn btn-sm ${x.key === filter ? "btn-coral" : "btn-outline"}`,
        text: `${x.label} (${requests.filter(x.match).length})`,
        onclick: () => { filter = x.key; renderRequests(); } }))),
      ...(list.length ? list.map(requestCard) : [el("div", { class: "empty", text: "Geen reservaties in deze lijst." })]),
      el("button", { class: "btn btn-outline btn-sm", type: "button", text: "Vernieuwen", onclick: loadRequests })
    );
  }

  async function loadRequests() {
    const { data, error } = await supabaseClient.from("reservation_requests").select("*").order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      els.requests.replaceChildren(el("div", { class: "empty", text: "Kon reservaties niet laden. Is schema-v4-reservaties.sql uitgevoerd?" }));
      return;
    }
    requests = data;
    renderRequests();
  }

  /* ---------------- instellingen ---------------- */
  function renderSettings() {
    const statusNode = el("span", { class: "status" });
    const num = (label, key, help) => {
      const input = el("input", { type: "number", min: 0, step: 1 });
      input.value = settings[key];
      input.addEventListener("input", () => { settings[key] = Number(input.value); });
      return el("div", {}, el("label", { text: label }), input, help && el("small", { class: "help", text: help }));
    };
    const hasMailFields = "payment_instructions" in settings;   // schema-v5 uitgevoerd?
    const payment = el("textarea", { rows: 3, placeholder: "bv. Rekeningnummer BE00 0000 0000 0000 op naam van …, met vermelding van je naam en datum. Of via Payconiq." });
    payment.value = settings.payment_instructions || "";
    payment.addEventListener("input", () => { settings.payment_instructions = payment.value; });
    const fields = ["total_tipis", "min_tipis", "months_ahead", "min_days_notice",
      ...(hasMailFields ? ["free_km", "max_km", "distance_surcharge", "deposit_amount", "deposit_days", "guarantee_amount", "payment_instructions"] : [])];

    els.settings.replaceChildren(
      el("div", { class: "price-grid" },
        num("Totaal aantal tipi's", "total_tipis", "Een weekend is volzet als de bevestigde reservaties samen dit aantal bereiken."),
        num("Minimum tipi's per boeking", "min_tipis"),
        num("Hoeveel maanden vooruit boekbaar", "months_ahead"),
        num("Minimum dagen op voorhand", "min_days_notice", "Weekends die dichterbij liggen, kunnen niet meer aangevraagd worden.")),
      hasMailFields && el("h3", { class: "block-title", text: "Levering en betaling" }),
      hasMailFields && el("div", { class: "price-grid" },
        num("Levering gratis tot (km, vogelvlucht)", "free_km"),
        num("Maximale afstand (km)", "max_km", "Verder weg: de klant ziet dat je het eerst samen bekijkt."),
        num("Toeslag tussen beide afstanden (€)", "distance_surcharge"),
        num("Voorschot (€)", "deposit_amount"),
        num("Voorschot betalen binnen (dagen)", "deposit_days"),
        num("Waarborg (€)", "guarantee_amount")),
      hasMailFields && el("div", {}, el("label", { text: "Betaalgegevens voor het voorschot (komen in de bevestigingsmail)" }), payment),
      el("div", { class: "row-actions" }, statusNode,
        el("button", { class: "btn btn-coral btn-sm", type: "button", text: "Instellingen opslaan", onclick: async () => {
          setStatus(statusNode, "Opslaan…");
          const { error } = await supabaseClient.from("booking_settings")
            .update(Object.fromEntries(fields.map(f => [f, settings[f]]))).eq("id", 1);
          setStatus(statusNode, error ? "Opslaan mislukt — controleer de waarden" : "Opgeslagen ✓", !!error);
        } }))
    );
  }

  /* ---------------- periodes ---------------- */
  function periodRow(p) {
    const statusNode = el("span", { class: "status" });
    const kind = el("select", {},
      el("option", { value: "blocked", text: "Blokkeren (niet boekbaar)" }),
      el("option", { value: "open", text: "Openzetten (bv. vakantie)" }));
    kind.value = p.kind;
    kind.addEventListener("change", () => { p.kind = kind.value; });
    const date = key => {
      const input = el("input", { type: "date" });
      input.value = p[key] || "";
      input.addEventListener("input", () => { p[key] = input.value; });
      return input;
    };
    const note = el("input", { type: "text", placeholder: "Notitie, bv. Herfstvakantie" });
    note.value = p.note || "";
    note.addEventListener("input", () => { p.note = note.value; });

    return el("div", { class: "period-row" },
      el("div", {}, el("label", { text: "Soort" }), kind),
      el("div", {}, el("label", { text: "Van" }), date("start_date")),
      el("div", {}, el("label", { text: "Tot en met" }), date("end_date")),
      el("div", {}, el("label", { text: "Notitie" }), note),
      el("div", { class: "row-actions" }, statusNode,
        el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "✕", title: "Verwijderen", onclick: async () => {
          if (p._saved) {
            if (!confirm("Deze periode verwijderen?")) return;
            const { error } = await supabaseClient.from("availability_periods").delete().eq("id", p.id);
            if (error) return setStatus(statusNode, "Verwijderen mislukt", true);
          }
          periods = periods.filter(x => x !== p);
          renderPeriods();
        } }),
        el("button", { class: "btn btn-coral btn-sm", type: "button", text: "Opslaan", onclick: async () => {
          if (!p.start_date || !p.end_date) return setStatus(statusNode, "Vul beide datums in", true);
          if (p.end_date < p.start_date) return setStatus(statusNode, "Einddatum ligt vóór de begindatum", true);
          setStatus(statusNode, "Opslaan…");
          const { error } = await supabaseClient.from("availability_periods")
            .upsert({ id: p.id, kind: p.kind, start_date: p.start_date, end_date: p.end_date, note: p.note || "" });
          if (error) { console.error(error); return setStatus(statusNode, "Opslaan mislukt", true); }
          p._saved = true;
          setStatus(statusNode, "Opgeslagen ✓");
        } }))
    );
  }

  function renderPeriods() {
    const upcoming = periods.filter(p => !p.end_date || p.end_date >= todayIso()).sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
    els.periods.replaceChildren(
      ...(upcoming.length ? upcoming.map(periodRow) : [el("div", { class: "empty", text: "Geen periodes. Weekends zijn standaard boekbaar; weekdagen niet." })]),
      el("button", { class: "btn btn-outline btn-sm", type: "button", text: "+ Periode toevoegen", onclick: () => {
        periods.push({ id: crypto.randomUUID(), kind: "blocked", start_date: "", end_date: "", note: "" });
        renderPeriods();
      } })
    );
  }

  /* ---------------- opstarten ---------------- */
  async function load(targets) {
    els = targets;
    const [s, p] = await Promise.all([
      supabaseClient.from("booking_settings").select("*").eq("id", 1).maybeSingle(),
      supabaseClient.from("availability_periods").select("*").order("start_date")
    ]);
    if (s.error || !s.data || p.error) {
      const msg = "Kon de reservatie-instellingen niet laden. Is schema-v4-reservaties.sql uitgevoerd?";
      [els.settings, els.periods, els.requests].forEach(x => x.replaceChildren(el("div", { class: "empty", text: msg })));
      return;
    }
    settings = s.data;
    periods = p.data.map(x => ({ ...x, _saved: true }));
    renderSettings();
    renderPeriods();
    loadRequests();
  }

  return { load };
})();
