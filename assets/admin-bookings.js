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

  async function changeStatus(r, next, statusNode) {
    if (next === "bevestigd" && r.status === "nieuw") {
      const free = await freeTipis(r);
      if (free !== null && r.tipis > free &&
          !confirm(`Let op: er zijn nog maar ${Math.max(free, 0)} tipi's vrij in deze periode, deze aanvraag vraagt er ${r.tipis}. Toch bevestigen?`)) return;
    }
    if (["geweigerd", "geannuleerd"].includes(next) && !confirm(`Deze reservatie op "${STATUS[next].label.toLowerCase()}" zetten?`)) return;
    setStatus(statusNode, "Opslaan…");
    const { error } = await supabaseClient.from("reservation_requests").update({ status: next }).eq("id", r.id);
    if (error) { console.error(error); return setStatus(statusNode, "Opslaan mislukt", true); }
    r.status = next;
    renderRequests();
  }

  function requestCard(r) {
    const statusNode = el("span", { class: "status" });
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
          el("div", { class: "res-what", text: `${r.theme_name || "Thema onbekend"} · ${r.tipis} tipi's${r.quoted_price != null ? ` · €${r.quoted_price}` : ""}` })),
        el("span", { class: `res-status ${st.cls}`, text: st.label })),
      el("div", { class: "res-grid" },
        el("div", {},
          el("b", { text: r.name }), el("br"), mail, el("br"), tel, el("br"),
          el("span", { text: r.address })),
        el("div", { class: "res-access" },
          el("div", { text: `Parkeren vlakbij: ${yn(r.parking_near)} · Laadplaats ≤ 25 m: ${yn(r.loading_within_25m)}` }),
          el("div", { text: `Gelijkvloers: ${yn(r.ground_floor)} · Trappen: ${yn(r.has_stairs)} · Lift: ${yn(r.has_elevator)}` }),
          r.delivery_time_pref && el("div", { text: `Levering: ${r.delivery_time_pref}` }),
          r.pickup_time_pref && el("div", { text: `Ophaling: ${r.pickup_time_pref}` }))),
      r.access_notes && el("p", { class: "res-msg", text: `Bereikbaarheid: ${r.access_notes}` }),
      r.message && el("p", { class: "res-msg", text: `Bericht: ${r.message}` }),
      note,
      el("div", { class: "row-actions" },
        el("span", { class: "res-created", text: `Aangevraagd op ${new Date(r.created_at).toLocaleString("nl-BE")}` }),
        statusNode,
        ...actions.map(([next, label, cls]) => el("button", { class: `btn ${cls} btn-sm`, type: "button", text: label,
          onclick: () => changeStatus(r, next, statusNode) })))
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
    els.settings.replaceChildren(
      el("div", { class: "price-grid" },
        num("Totaal aantal tipi's", "total_tipis", "Een weekend is volzet als de bevestigde reservaties samen dit aantal bereiken."),
        num("Minimum tipi's per boeking", "min_tipis"),
        num("Hoeveel maanden vooruit boekbaar", "months_ahead"),
        num("Minimum dagen op voorhand", "min_days_notice", "Weekends die dichterbij liggen, kunnen niet meer aangevraagd worden.")),
      el("div", { class: "row-actions" }, statusNode,
        el("button", { class: "btn btn-coral btn-sm", type: "button", text: "Instellingen opslaan", onclick: async () => {
          setStatus(statusNode, "Opslaan…");
          const { error } = await supabaseClient.from("booking_settings").update({
            total_tipis: settings.total_tipis, min_tipis: settings.min_tipis,
            months_ahead: settings.months_ahead, min_days_notice: settings.min_days_notice
          }).eq("id", 1);
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
