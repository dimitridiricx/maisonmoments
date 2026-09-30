/* ------------------------------------------------------------------
   Maison Moments — beschikbaarheidskalender + aanvraagformulier
   (gebruikt op thema.html)

   - Weekends (vrijdag t/m zondag) zijn boekbaar.
   - Periodes die de beheerder "open" zet (bv. schoolvakanties): elke dag
     kan dan een startdag zijn, met dezelfde formule (3 dagen, 2 nachten).
   - Geblokkeerde periodes en volzette weekends zijn niet boekbaar.
   - Enkel bevestigde reservaties tellen mee; de database-functie
     get_availability geeft enkel aantallen terug, nooit klantgegevens.
------------------------------------------------------------------- */
const Booking = (() => {
  const DAY = 86400000;
  const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  const WEEKDAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

  // Datums als "YYYY-MM-DD" in lokale tijd, zonder tijdzone-verschuivingen.
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const isoDow = d => (d.getDay() + 6) % 7 + 1;   // 1 = maandag … 7 = zondag
  const nice = d => d.toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "long" });

  let state;

  /* ---------------- beschikbaarheid berekenen ---------------- */
  // Startdagen die geboekt kunnen worden, met het aantal vrije tipi's.
  function startOptions() {
    const { days, settings, today } = state;
    const first = addDays(today, settings.min_days_notice);
    const result = new Map();
    for (const [key] of days) {
      const start = parse(key);
      if (start < first) continue;
      const span = [0, 1, 2].map(i => days.get(iso(addDays(start, i))));
      if (span.some(x => !x)) continue;
      const isWeekend = isoDow(start) === 5;
      const inOpenPeriod = span.every(x => x.opened);
      if (!isWeekend && !inOpenPeriod) continue;
      const blocked = span.some(x => x.blocked);
      const free = blocked ? 0 : Math.max(0, settings.total_tipis - Math.max(...span.map(x => x.booked)));
      result.set(key, { start, free, blocked, isWeekend, full: free < settings.min_tipis });
    }
    return result;
  }

  // Tipi-opties uit de prijstabel ("2 tipi's" -> 2).
  function tipiChoices(free) {
    const rows = (state.pricing || [])
      .map(p => ({ n: parseInt(p.label, 10), price: p.price, label: p.label }))
      .filter(p => Number.isFinite(p.n));
    const min = state.settings.min_tipis;
    if (rows.length) return rows.filter(p => p.n >= min && p.n <= free);
    return Array.from({ length: Math.max(0, free - min + 1) }, (_, i) => ({ n: min + i, price: null, label: `${min + i} tipi's` }));
  }

  /* ---------------- kalender tekenen ---------------- */
  function renderCalendar() {
    const { root, month, options, selected, lastMonth, today } = state;
    const cal = root.querySelector(".cal");
    const y = month.getFullYear(), m = month.getMonth();
    const firstDay = new Date(y, m, 1);
    const offset = isoDow(firstDay) - 1;
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    // welke dag hoort bij welke startdag (voor de band vr-za-zo)
    const owner = new Map();
    for (const [key, opt] of options) {
      if (!opt.isWeekend) continue;
      [0, 1, 2].forEach(i => owner.set(iso(addDays(opt.start, i)), key));
    }
    const selectedDays = selected ? [0, 1, 2].map(i => iso(addDays(parse(selected), i))) : [];

    const cells = [];
    for (let i = 0; i < offset; i++) cells.push('<div class="cal-cell cal-pad" aria-hidden="true"></div>');
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m, d);
      const key = iso(date);
      const ownKey = owner.get(key);
      const own = ownKey ? options.get(ownKey) : options.get(key);
      const classes = ["cal-cell"];
      let label = "", action = "";
      if (date < today) classes.push("past");
      if (selectedDays.includes(key)) classes.push("selected");

      if (own && (ownKey || !own.isWeekend)) {
        const status = own.full ? "full" : own.free < state.settings.total_tipis ? "partial" : "free";
        classes.push("bookable", status, own.isWeekend ? "weekend" : "holiday");
        if (own.isWeekend) {
          const pos = isoDow(date) - 5;           // 0 = vr, 1 = za, 2 = zo
          classes.push(["band-start", "band-mid", "band-end"][pos]);
        }
        const startKey = ownKey || key;
        if (!own.isWeekend || isoDow(date) === 5 || d === 1) {
          label = own.full ? "Volzet" : status === "partial" ? `Nog ${own.free}` : "Vrij";
        }
        if (!own.full) action = `data-start="${startKey}"`;
      } else if (date >= today) {
        classes.push("closed");
        action = 'data-closed="1"';
      }
      const aria = own && (ownKey || !own.isWeekend)
        ? `${nice(date)}: ${own.full ? "volzet" : own.free + " tipi's vrij"}`
        : nice(date);
      cells.push(`<button type="button" class="${classes.join(" ")}" ${action} aria-label="${aria}" ${action ? "" : "tabindex=\"-1\""}>
        <span class="cal-num">${d}</span>${label ? `<span class="cal-label">${label}</span>` : ""}</button>`);
    }

    const canPrev = month > new Date(today.getFullYear(), today.getMonth(), 1);
    const canNext = month < lastMonth;
    cal.innerHTML = `
      <div class="cal-head">
        <button type="button" class="cal-nav" data-nav="-1" ${canPrev ? "" : "disabled"} aria-label="Vorige maand">‹</button>
        <strong>${MONTHS[m]} ${y}</strong>
        <button type="button" class="cal-nav" data-nav="1" ${canNext ? "" : "disabled"} aria-label="Volgende maand">›</button>
      </div>
      <div class="cal-grid">
        ${WEEKDAYS.map(w => `<div class="cal-wd">${w}</div>`).join("")}
        ${cells.join("")}
      </div>`;
  }

  /* ---------------- formulier ---------------- */
  const yesNo = (name, label) => `
    <fieldset class="yn"><legend>${label}</legend>
      <label><input type="radio" name="${name}" value="true"> Ja</label>
      <label><input type="radio" name="${name}" value="false"> Nee</label>
    </fieldset>`;

  function renderForm() {
    const box = state.root.querySelector(".booking-form");
    const hint = state.root.querySelector(".cal-hint");
    if (!state.selected) { box.hidden = true; return; }
    const opt = state.options.get(state.selected);
    const start = parse(state.selected), end = addDays(start, 2);
    const choices = tipiChoices(opt.free);
    hint.textContent = "";
    box.hidden = false;
    box.innerHTML = `
      <h3>Aanvraag voor ${MM.esc(state.theme.name)}</h3>
      <p class="picked">📅 <b>${nice(start)}</b> tot <b>${nice(end)}</b> · nog ${opt.free} tipi's vrij
        <button type="button" class="link-btn" data-clear>Andere datum</button></p>
      <form novalidate>
        <div class="frow">
          <div><label for="bTipis">Aantal tipi's *</label>
            <select id="bTipis" name="tipis" required>
              ${choices.map(c => `<option value="${c.n}" data-price="${c.price ?? ""}">${MM.esc(c.label)}${c.price != null ? ` — ${MM.euro(c.price)}` : ""}</option>`).join("")}
            </select></div>
          <div class="price-box"><span>Prijs</span><b id="bPrice"></b></div>
        </div>
        <h4>Contactgegevens</h4>
        <div class="frow">
          <div><label for="bName">Naam *</label><input id="bName" name="name" required maxlength="120" autocomplete="name"></div>
          <div><label for="bPhone">Telefoonnummer *</label><input id="bPhone" name="phone" type="tel" required maxlength="40" autocomplete="tel"></div>
        </div>
        <div class="frow">
          <div><label for="bEmail">E-mailadres *</label><input id="bEmail" name="email" type="email" required maxlength="200" autocomplete="email"></div>
          <div><label for="bAddress">Adres van het feestje *</label><input id="bAddress" name="address" required maxlength="300" autocomplete="street-address" placeholder="Straat nr, postcode gemeente">
            <div class="distance" id="bDistance" role="status"></div></div>
        </div>
        <h4>Bereikbaarheid</h4>
        <div class="yn-grid">
          ${yesNo("parking_near", "Kunnen we vlak bij de woning parkeren?")}
          ${yesNo("loading_within_25m", "Is er een legale laad- of parkeerplaats binnen ongeveer 25 meter?")}
          ${yesNo("ground_floor", "Bevindt de ruimte zich op het gelijkvloers?")}
          ${yesNo("has_stairs", "Zijn er trappen?")}
          ${yesNo("has_elevator", "Is er een lift beschikbaar?")}
        </div>
        <div class="frow full"><div><label for="bAccess">Andere zaken waarmee we bij de levering rekening moeten houden?</label>
          <textarea id="bAccess" name="access_notes" maxlength="2000"></textarea></div></div>
        <h4>Levering en ophaling</h4>
        <div class="frow">
          <div><label for="bDelivery">Voorkeurstijd levering en opbouw (${nice(start)})</label><input id="bDelivery" name="delivery_time_pref" maxlength="100" placeholder="bv. tussen 17 en 19 uur"></div>
          <div><label for="bPickup">Voorkeurstijd afbraak en ophaling (${nice(end)})</label><input id="bPickup" name="pickup_time_pref" maxlength="100" placeholder="bv. na 14 uur"></div>
        </div>
        <div class="frow full"><div><label for="bMessage">Nog iets dat we moeten weten?</label>
          <textarea id="bMessage" name="message" maxlength="2000"></textarea></div></div>
        <div class="hp" aria-hidden="true"><label>Laat dit veld leeg<input name="website" tabindex="-1" autocomplete="off"></label></div>
        <label class="consent"><input type="checkbox" name="privacy" required>
          Ik ga akkoord dat Maison Moments mijn gegevens gebruikt om deze aanvraag te behandelen.</label>
        <p class="note">We nemen na ontvangst contact op om de beschikbaarheid, planning en totaalprijs te bevestigen.
          De reservatie is definitief na betaling van het voorschot. Je ontvangt een bevestiging van je aanvraag per mail.</p>
        <button type="submit" class="cta-btn">Aanvraag versturen</button>
        <div class="form-msg" role="status"></div>
      </form>`;

    const select = box.querySelector("#bTipis");
    const showPrice = () => {
      const p = select.selectedOptions[0]?.dataset.price;
      const extra = state.distance?.surcharge || 0;
      box.querySelector("#bPrice").textContent = p
        ? MM.euro(Number(p) + extra) + (extra ? ` (incl. ${MM.euro(extra)} levering)` : "")
        : "op aanvraag";
    };
    select.addEventListener("change", showPrice);
    showPrice();

    // afstand berekenen zodra het adres ingevuld is (niet bij elke toets)
    state.distance = null;
    const address = box.querySelector("#bAddress");
    const distanceBox = box.querySelector("#bDistance");
    address.addEventListener("change", async () => {
      state.distance = null;
      showPrice();
      const value = address.value.trim();
      if (value.length < 5) { distanceBox.textContent = ""; return; }
      distanceBox.className = "distance";
      distanceBox.textContent = "Afstand berekenen…";
      try {
        const { data, error } = await supabaseClient.functions.invoke("quote-distance", { body: { address: value } });
        if (address.value.trim() !== value) return;   // intussen gewijzigd
        if (error || !data) throw error || new Error("geen antwoord");
        if (!data.found) {
          distanceBox.className = "distance warn";
          distanceBox.textContent = "We vinden dit adres niet terug. Controleer straat, nummer en gemeente; we bevestigen de levering sowieso nog.";
          return;
        }
        state.distance = data;
        const s = state.settings;
        distanceBox.className = `distance ${data.zone}`;
        distanceBox.textContent = data.zone === "free"
          ? `± ${data.km} km — levering inbegrepen ✓`
          : data.zone === "extra"
            ? `± ${data.km} km — levering ${MM.euro(data.surcharge)} extra`
            : `± ${data.km} km — dat is verder dan ${s.max_km ?? 30} km. Stuur gerust je aanvraag, dan bekijken we samen of het mogelijk is.`;
        showPrice();
      } catch (err) {
        console.warn("Afstand niet berekend:", err);
        distanceBox.className = "distance";
        distanceBox.textContent = "";
      }
    });
    box.querySelector("[data-clear]").addEventListener("click", () => { state.selected = null; renderCalendar(); renderForm(); });
    box.querySelector("form").addEventListener("submit", submit);
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit(e) {
    e.preventDefault();
    const form = e.target;
    const msg = form.querySelector(".form-msg");
    const btn = form.querySelector("button[type=submit]");
    const f = new FormData(form);
    msg.className = "form-msg";

    if (f.get("website")) { msg.className = "form-msg ok"; msg.textContent = "Bedankt! We nemen snel contact met je op."; return; }
    const missing = [...form.querySelectorAll("[required]")].filter(i => i.type === "checkbox" ? !i.checked : !i.value.trim());
    if (missing.length) {
      msg.className = "form-msg err";
      msg.textContent = "Vul alle velden met een * in en ga akkoord met het gebruik van je gegevens.";
      missing[0].focus();
      return;
    }
    if (!form.querySelector("#bEmail").checkValidity()) {
      msg.className = "form-msg err"; msg.textContent = "Dit e-mailadres lijkt niet te kloppen."; return;
    }

    const bool = name => (f.get(name) === null ? null : f.get(name) === "true");
    const start = parse(state.selected);
    const tipis = Number(f.get("tipis"));
    const price = form.querySelector("#bTipis").selectedOptions[0]?.dataset.price;
    const payload = {
      theme_id: state.theme.id || null,
      theme_name: state.theme.name,
      start_date: state.selected,
      end_date: iso(addDays(start, 2)),
      tipis,
      quoted_price: price ? Number(price) : null,
      distance_km: state.distance ? state.distance.km : null,
      delivery_surcharge: state.distance ? state.distance.surcharge : null,
      name: f.get("name").trim(),
      email: f.get("email").trim(),
      phone: f.get("phone").trim(),
      address: f.get("address").trim(),
      parking_near: bool("parking_near"),
      loading_within_25m: bool("loading_within_25m"),
      ground_floor: bool("ground_floor"),
      has_stairs: bool("has_stairs"),
      has_elevator: bool("has_elevator"),
      access_notes: f.get("access_notes").trim(),
      delivery_time_pref: f.get("delivery_time_pref").trim(),
      pickup_time_pref: f.get("pickup_time_pref").trim(),
      message: f.get("message").trim(),
      privacy_accepted: true
    };

    btn.disabled = true;
    const { error } = await supabaseClient.from("reservation_requests").insert(payload);
    btn.disabled = false;
    if (error) {
      console.error(error);
      msg.className = "form-msg err";
      // P0001 = melding uit onze eigen controle (bv. "nog maar 2 tipi's vrij")
      msg.textContent = error.code === "P0001" ? error.message
        : "Er ging iets mis bij het versturen. Probeer het opnieuw of neem contact met ons op.";
      return;
    }
    form.replaceWith(Object.assign(document.createElement("div"), {
      className: "form-done",
      innerHTML: `<h3>Bedankt voor je aanvraag! 🤍</h3><p>We bekijken de beschikbaarheid en nemen zo snel mogelijk contact met je op via <b>${MM.esc(payload.email)}</b> of telefoon.</p>`
    }));
  }

  /* ---------------- opstarten ---------------- */
  async function mount(root, theme, concept) {
    root.innerHTML = `
      <div class="cal-legend">
        <span><i class="dot free"></i>Vrij</span><span><i class="dot partial"></i>Nog enkele tipi's</span>
        <span><i class="dot full"></i>Volzet</span><span><i class="dot holiday"></i>Vakantie</span>
      </div>
      <div class="cal"><div class="placeholder">Kalender laden…</div></div>
      <p class="cal-hint" role="status"></p>
      <div class="booking-form" hidden></div>`;

    const fail = () => {
      root.querySelector(".cal").innerHTML = `<div class="placeholder">De kalender is even niet beschikbaar.
        <a href="site-volledig.html#contact">Neem contact op</a> voor een aanvraag.</div>`;
    };
    if (typeof supabaseClient === "undefined" || !supabaseClient) return fail();

    const today = new Date(); today.setHours(0, 0, 0, 0);
    try {
      const { data: settings, error: e1 } = await supabaseClient.from("booking_settings").select("*").eq("id", 1).maybeSingle();
      if (e1 || !settings) throw e1 || new Error("geen instellingen");
      const until = new Date(today.getFullYear(), today.getMonth() + settings.months_ahead + 1, 0);
      const { data: rows, error: e2 } = await supabaseClient.rpc("get_availability", { from_date: iso(today), to_date: iso(addDays(until, 2)) });
      if (e2) throw e2;
      state = {
        root, theme, today, settings,
        pricing: MM.resolve(theme, concept, "pricing"),
        days: new Map(rows.map(r => [r.day, r])),
        month: new Date(today.getFullYear(), today.getMonth(), 1),
        lastMonth: new Date(until.getFullYear(), until.getMonth(), 1),
        selected: null
      };
      state.options = startOptions();
      // openen op de eerste maand waarin iets te boeken valt
      const first = [...state.options.values()].find(o => !o.full);
      if (first) state.month = new Date(first.start.getFullYear(), first.start.getMonth(), 1);
      if (![...state.options.values()].some(o => !o.isWeekend)) root.querySelector(".dot.holiday").parentElement.remove();
    } catch (err) {
      console.error(err);
      return fail();
    }

    root.addEventListener("click", e => {
      const nav = e.target.closest("[data-nav]");
      if (nav) {
        state.month = new Date(state.month.getFullYear(), state.month.getMonth() + Number(nav.dataset.nav), 1);
        renderCalendar();
        return;
      }
      const day = e.target.closest(".cal-cell");
      if (!day) return;
      const hint = root.querySelector(".cal-hint");
      if (day.dataset.start) {
        state.selected = day.dataset.start;
        renderCalendar();
        renderForm();
      } else if (day.dataset.closed) {
        hint.innerHTML = 'Tijdens de week of in een verlengd weekend? Dat kan soms ook — <a href="site-volledig.html#contact">neem contact op</a>.';
      } else if (day.classList.contains("full")) {
        hint.textContent = "Dit weekend is volzet. Kies gerust een ander weekend.";
      }
    });

    renderCalendar();
  }

  return { mount };
})();
