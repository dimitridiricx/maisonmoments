/* ------------------------------------------------------------------
   Maison Moments — beheer van concepten, thema's en media (admin.html)

   Alle tekst wordt via .value / .textContent in de pagina gezet, nooit
   via innerHTML, zodat ingevoerde tekst geen code kan uitvoeren.
------------------------------------------------------------------- */
const Catalog = (() => {
  const BUCKET = "theme-media";
  const MAX_IMAGE_SIDE = 1600;   // foto's worden vóór upload verkleind
  const DETAIL_FIELDS = ["price_from", "price_unit", "pricing_intro", "pricing", "pricing_note", "included", "info_sections"];
  const CONCEPT_COLUMNS = ["id", "slug", "name", "emoji", "tagline", "description", "cover_url", "color_from", "color_to", "published", "sort_order", ...DETAIL_FIELDS];
  const THEME_COLUMNS = [...CONCEPT_COLUMNS, "concept_id"];

  let concepts = [], themes = [], media = [];
  let root;

  /* ---------------- kleine DOM-helpers ---------------- */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : v);
    }
    children.flat().forEach(c => c && node.append(c));
    return node;
  }

  const slugify = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  function field(label, obj, key, opts = {}) {
    const input = opts.multiline ? el("textarea", { rows: opts.rows || 3 }) : el("input", { type: opts.type || "text" });
    if (opts.type === "number") { input.min = 0; input.step = opts.step || 1; }
    input.value = obj[key] ?? "";
    input.addEventListener("input", () => {
      obj[key] = opts.type === "number" ? (input.value === "" ? null : Number(input.value)) : input.value;
      opts.onInput && opts.onInput(input.value);
    });
    return el("div", { class: opts.full ? "full" : "" }, el("label", { text: label }), input);
  }

  function colorField(label, obj, key) {
    const input = el("input", { type: "color", value: obj[key] || "#E9DCC9" });
    input.addEventListener("input", () => { obj[key] = input.value; });
    return el("div", { class: "cg" }, el("label", { text: label }), input);
  }

  function checkbox(label, obj, key, onChange) {
    const input = el("input", { type: "checkbox" });
    input.checked = !!obj[key];
    input.addEventListener("change", () => { obj[key] = input.checked; onChange && onChange(input.checked); });
    return el("label", { class: "check" }, input, document.createTextNode(" " + label));
  }

  function status() { return el("span", { class: "status" }); }
  function setStatus(node, text, isError) { node.textContent = text; node.className = isError ? "status err" : "status"; }

  /* ---------------- lijst-editors ---------------- */
  // Prijstabel: [{label, price}]
  function pricingEditor(obj) {
    obj.pricing = Array.isArray(obj.pricing) ? obj.pricing : [];
    const box = el("div", { class: "full" }, el("label", { text: "Prijstabel" }));
    const rows = el("div");
    const draw = () => {
      rows.replaceChildren(...obj.pricing.map((p, i) => el("div", { class: "mini-row" },
        field("Omschrijving", p, "label"),
        field("Prijs (€)", p, "price", { type: "number", step: 0.5 }),
        el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "✕", title: "Regel verwijderen",
          onclick: () => { obj.pricing.splice(i, 1); draw(); } })
      )));
    };
    draw();
    box.append(rows, el("button", { class: "btn btn-outline btn-sm", type: "button", text: "+ Prijsregel",
      onclick: () => { obj.pricing.push({ label: "", price: 0 }); draw(); } }));
    return box;
  }

  // Inbegrepen: één item per regel
  function linesEditor(label, obj, key) {
    obj[key] = Array.isArray(obj[key]) ? obj[key] : [];
    const input = el("textarea", { rows: 6 });
    input.value = obj[key].join("\n");
    input.addEventListener("input", () => { obj[key] = input.value.split("\n").map(s => s.trim()).filter(Boolean); });
    return el("div", { class: "full" }, el("label", { text: label + " (één per regel)" }), input);
  }

  // Info-blokken: [{title, body}]
  function sectionsEditor(obj) {
    obj.info_sections = Array.isArray(obj.info_sections) ? obj.info_sections : [];
    const box = el("div", { class: "full" }, el("label", { text: "Info-blokken op de themapagina" }));
    const rows = el("div");
    const draw = () => {
      rows.replaceChildren(...obj.info_sections.map((s, i) => el("div", { class: "section-row" },
        field("Titel", s, "title"),
        field("Tekst", s, "body", { multiline: true, rows: 3 }),
        el("div", { class: "row-actions" },
          i > 0 && el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "↑",
            onclick: () => { [obj.info_sections[i - 1], obj.info_sections[i]] = [obj.info_sections[i], obj.info_sections[i - 1]]; draw(); } }),
          el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Blok verwijderen",
            onclick: () => { obj.info_sections.splice(i, 1); draw(); } }))
      )));
    };
    draw();
    box.append(rows, el("button", { class: "btn btn-outline btn-sm", type: "button", text: "+ Info-blok",
      onclick: () => { obj.info_sections.push({ title: "", body: "" }); draw(); } }));
    return box;
  }

  function detailsFields(obj) {
    return [
      field("Vanaf-prijs (€)", obj, "price_from", { type: "number" }),
      field("Prijs geldt", obj, "price_unit"),
      field("Tekst boven de prijstabel", obj, "pricing_intro", { multiline: true, full: true }),
      pricingEditor(obj),
      field("Tekst onder de prijstabel", obj, "pricing_note", { multiline: true, full: true, rows: 2 }),
      linesEditor("Inbegrepen", obj, "included"),
      sectionsEditor(obj)
    ];
  }

  /* ---------------- opslaan ---------------- */
  const pick = (obj, cols) => Object.fromEntries(cols.map(c => [c, obj[c] === undefined ? null : obj[c]]));

  async function save(table, obj, cols, statusNode) {
    if (!obj.name || !obj.name.trim()) return setStatus(statusNode, "Vul een naam in", true);
    obj.slug = slugify(obj.slug || obj.name);
    if (!obj.slug) return setStatus(statusNode, "Ongeldige link-naam", true);
    setStatus(statusNode, "Opslaan…");
    const { error } = await supabaseClient.from(table).upsert(pick(obj, cols));
    if (error) {
      const taken = error.code === "23505";
      setStatus(statusNode, taken ? "Deze link-naam bestaat al, kies een andere" : "Opslaan mislukt", true);
      console.error(error);
      return false;
    }
    obj._saved = true;
    setStatus(statusNode, "Opgeslagen ✓");
    return true;
  }

  /* ---------------- media ---------------- */
  function youtubeId(url) {
    const m = String(url || "").match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
    return m ? m[1] : "";
  }

  // Verkleint een foto tot max. 1600 px en zet ze om naar WebP (of JPEG).
  async function shrinkImage(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const webp = await new Promise(r => canvas.toBlob(r, "image/webp", 0.85));
    if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp", type: "image/webp" };
    const jpeg = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85));
    return { blob: jpeg, ext: "jpg", type: "image/jpeg" };
  }

  async function uploadImages(theme, files, statusNode, redraw) {
    const list = [...files].filter(f => f.type.startsWith("image/"));
    for (let i = 0; i < list.length; i++) {
      setStatus(statusNode, `Foto ${i + 1} van ${list.length} uploaden…`);
      try {
        const { blob, ext, type } = await shrinkImage(list[i]);
        const path = `${theme.id}/${crypto.randomUUID()}.${ext}`;
        const up = await supabaseClient.storage.from(BUCKET).upload(path, blob, { contentType: type });
        if (up.error) throw up.error;
        const url = supabaseClient.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        const row = { id: crypto.randomUUID(), theme_id: theme.id, type: "image", url, storage_path: path,
          caption: "", sort_order: themeMedia(theme).length };
        const ins = await supabaseClient.from("theme_media").insert(row);
        if (ins.error) throw ins.error;
        media.push(row);
      } catch (err) {
        console.error(err);
        setStatus(statusNode, `Upload van "${list[i].name}" mislukt`, true);
        redraw();
        return;
      }
    }
    setStatus(statusNode, "Foto's toegevoegd ✓");
    redraw();
  }

  // Tegelfoto van een concept: uploaden of een link plakken.
  function coverField(obj) {
    const statusNode = status();
    const url = el("input", { type: "text", placeholder: "Link naar een foto, of upload er een" });
    url.value = obj.cover_url || "";
    url.addEventListener("input", () => { obj.cover_url = url.value.trim() || null; });
    const fileInput = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", hidden: true });
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      setStatus(statusNode, "Uploaden…");
      try {
        const { blob, ext, type } = await shrinkImage(file);
        const path = `concepts/${crypto.randomUUID()}.${ext}`;
        const up = await supabaseClient.storage.from(BUCKET).upload(path, blob, { contentType: type });
        if (up.error) throw up.error;
        obj.cover_url = url.value = supabaseClient.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        setStatus(statusNode, "Geüpload — vergeet niet op te slaan");
      } catch (err) {
        console.error(err);
        setStatus(statusNode, "Upload mislukt", true);
      }
    });
    return el("div", { class: "full" }, el("label", { text: "Tegelfoto (optioneel)" }),
      el("div", { class: "media-actions" }, url,
        el("button", { class: "btn btn-outline btn-sm", type: "button", text: "Foto uploaden", onclick: () => fileInput.click() }),
        fileInput, statusNode));
  }

  const themeMedia = theme => media.filter(m => m.theme_id === theme.id).sort((a, b) => a.sort_order - b.sort_order);

  async function saveMediaOrder(items) {
    items.forEach((m, i) => { m.sort_order = i; });
    await Promise.all(items.map(m => supabaseClient.from("theme_media").update({ sort_order: m.sort_order }).eq("id", m.id)));
  }

  function mediaManager(theme) {
    const box = el("div", { class: "media-box full" });
    const statusNode = status();
    const grid = el("div", { class: "media-grid" });

    const draw = () => {
      if (!theme._saved) {
        grid.replaceChildren(el("div", { class: "empty", text: "Sla het thema eerst op, daarna kan je foto's en video's toevoegen." }));
        return;
      }
      const items = themeMedia(theme);
      if (!items.length) {
        grid.replaceChildren(el("div", { class: "empty", text: "Nog geen foto's of video's. De eerste foto wordt de tegelfoto." }));
        return;
      }
      grid.replaceChildren(...items.map((m, i) => {
        const preview = m.type === "image"
          ? el("img", { src: m.url, alt: "" })
          : el("img", { src: `https://img.youtube.com/vi/${youtubeId(m.url)}/mqdefault.jpg`, alt: "" });
        const caption = el("input", { type: "text", placeholder: "Bijschrift (optioneel)" });
        caption.value = m.caption || "";
        caption.addEventListener("change", async () => {
          m.caption = caption.value;
          const { error } = await supabaseClient.from("theme_media").update({ caption: m.caption }).eq("id", m.id);
          setStatus(statusNode, error ? "Bijschrift opslaan mislukt" : "Bijschrift opgeslagen ✓", !!error);
        });
        return el("div", { class: "media-item" },
          el("div", { class: "media-thumb" }, preview, m.type === "youtube" && el("span", { class: "badge", text: "▶ YouTube" }),
            i === 0 && m.type === "image" && el("span", { class: "badge badge-cover", text: "Tegelfoto" })),
          caption,
          el("div", { class: "row-actions" },
            i > 0 && el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "←", title: "Naar voren",
              onclick: async () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; await saveMediaOrder(items); draw(); } }),
            el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Verwijderen",
              onclick: async () => {
                if (!confirm("Deze foto of video verwijderen?")) return;
                if (m.storage_path) await supabaseClient.storage.from(BUCKET).remove([m.storage_path]);
                const { error } = await supabaseClient.from("theme_media").delete().eq("id", m.id);
                if (error) return setStatus(statusNode, "Verwijderen mislukt", true);
                media = media.filter(x => x.id !== m.id);
                await saveMediaOrder(themeMedia(theme));
                draw();
              } }))
        );
      }));
    };

    const fileInput = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true, hidden: true });
    fileInput.addEventListener("change", () => { uploadImages(theme, fileInput.files, statusNode, draw); fileInput.value = ""; });

    const ytInput = el("input", { type: "text", placeholder: "Plak een YouTube-link" });
    const addYoutube = async () => {
      if (!theme._saved) return setStatus(statusNode, "Sla het thema eerst op", true);
      const id = youtubeId(ytInput.value);
      if (!id) return setStatus(statusNode, "Dit lijkt geen geldige YouTube-link", true);
      const row = { id: crypto.randomUUID(), theme_id: theme.id, type: "youtube", url: `https://www.youtube.com/watch?v=${id}`,
        caption: "", sort_order: themeMedia(theme).length };
      const { error } = await supabaseClient.from("theme_media").insert(row);
      if (error) return setStatus(statusNode, "Video toevoegen mislukt", true);
      media.push(row);
      ytInput.value = "";
      setStatus(statusNode, "Video toegevoegd ✓");
      draw();
    };

    box.append(
      el("label", { text: "Foto's en video's" }),
      grid,
      el("div", { class: "media-actions" },
        el("button", { class: "btn btn-outline btn-sm", type: "button", text: "+ Foto's uploaden",
          onclick: () => theme._saved ? fileInput.click() : setStatus(statusNode, "Sla het thema eerst op", true) }),
        fileInput,
        ytInput,
        el("button", { class: "btn btn-outline btn-sm", type: "button", text: "+ Video", onclick: addYoutube }),
        statusNode)
    );
    draw();
    box.redraw = draw;
    return box;
  }

  /* ---------------- thema-kaart ---------------- */
  function themeCard(theme, concept) {
    const statusNode = status();
    const title = el("span", { text: theme.name || "Nieuw thema" });
    const hasOwnDetails = DETAIL_FIELDS.some(f => theme[f] !== null && theme[f] !== undefined);
    const overrideBox = el("div", { class: "theme-fields override" });
    const mediaBox = mediaManager(theme);

    const drawOverride = on => {
      overrideBox.replaceChildren(...(on ? detailsFields(theme) : []));
      overrideBox.hidden = !on;
    };
    const ownToggle = { own: hasOwnDetails };

    const card = el("details", { class: "item" },
      el("summary", {}, title, !theme.published && el("span", { class: "pill", text: "verborgen" })),
      el("div", { class: "theme-fields" },
        field("Naam", theme, "name", { onInput: v => { title.textContent = v; } }),
        field("Link-naam (in de URL)", theme, "slug"),
        field("Emoji (als er geen foto is)", theme, "emoji"),
        field("Volgorde", theme, "sort_order", { type: "number" }),
        field("Korte zin op de tegel", theme, "tagline", { full: true }),
        field("Beschrijving", theme, "description", { multiline: true, full: true }),
        el("div", { class: "full color-row" }, colorField("Kleur 1", theme, "color_from"), colorField("Kleur 2", theme, "color_to")),
        el("div", { class: "full" }, checkbox("Zichtbaar op de website", theme, "published")),
        mediaBox,
        el("div", { class: "full" }, checkbox(`Eigen prijzen en info (anders die van ${concept.name})`, ownToggle, "own", on => {
          if (on) DETAIL_FIELDS.forEach(f => { theme[f] = structuredClone(concept[f] ?? null); });
          else DETAIL_FIELDS.forEach(f => { theme[f] = null; });
          drawOverride(on);
        }))
      ),
      overrideBox,
      el("div", { class: "row-actions" },
        statusNode,
        el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Thema verwijderen", onclick: async () => {
          if (!confirm(`"${theme.name}" en al zijn foto's verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
          if (theme._saved) {
            const paths = themeMedia(theme).map(m => m.storage_path).filter(Boolean);
            if (paths.length) await supabaseClient.storage.from(BUCKET).remove(paths);
            const { error } = await supabaseClient.from("party_themes").delete().eq("id", theme.id);
            if (error) return setStatus(statusNode, "Verwijderen mislukt", true);
          }
          themes = themes.filter(t => t !== theme);
          render();
        } }),
        el("button", { class: "btn btn-coral btn-sm", type: "button", text: "Opslaan", onclick: async () => {
          if (!ownToggle.own) DETAIL_FIELDS.forEach(f => { theme[f] = null; });
          if (await save("party_themes", theme, THEME_COLUMNS, statusNode)) mediaBox.redraw();
        } })
      )
    );
    drawOverride(hasOwnDetails);
    return card;
  }

  /* ---------------- concept-kaart ---------------- */
  function conceptCard(concept) {
    const statusNode = status();
    const title = el("span", { text: concept.name || "Nieuw concept" });
    const list = themes.filter(t => t.concept_id === concept.id).sort((a, b) => a.sort_order - b.sort_order);

    return el("details", { class: "item concept", open: concepts.length === 1 },
      el("summary", {}, title, !concept.published && el("span", { class: "pill", text: "verborgen" })),
      el("h3", { class: "block-title", text: "Algemeen" }),
      el("div", { class: "theme-fields" },
        field("Naam", concept, "name", { onInput: v => { title.textContent = v; } }),
        field("Link-naam (in de URL)", concept, "slug"),
        field("Emoji (als er geen foto is)", concept, "emoji"),
        field("Volgorde", concept, "sort_order", { type: "number" }),
        coverField(concept),
        field("Korte zin op de tegel", concept, "tagline", { full: true }),
        field("Beschrijving", concept, "description", { multiline: true, full: true }),
        el("div", { class: "full color-row" }, colorField("Kleur 1", concept, "color_from"), colorField("Kleur 2", concept, "color_to")),
        el("div", { class: "full" }, checkbox("Zichtbaar op de website", concept, "published"))
      ),
      el("h3", { class: "block-title", text: "Prijzen en info (voor alle thema's hieronder)" }),
      el("div", { class: "theme-fields" }, ...detailsFields(concept)),
      el("div", { class: "row-actions" },
        statusNode,
        el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Concept verwijderen", onclick: async () => {
          if (list.length) return setStatus(statusNode, "Verwijder eerst de thema's van dit concept", true);
          if (!confirm(`"${concept.name}" verwijderen?`)) return;
          if (concept._saved) {
            const { error } = await supabaseClient.from("concepts").delete().eq("id", concept.id);
            if (error) return setStatus(statusNode, "Verwijderen mislukt", true);
          }
          concepts = concepts.filter(c => c !== concept);
          render();
        } }),
        el("button", { class: "btn btn-coral btn-sm", type: "button", text: "Concept opslaan",
          onclick: () => save("concepts", concept, CONCEPT_COLUMNS, statusNode) })
      ),
      el("h3", { class: "block-title", text: `Thema's in ${concept.name || "dit concept"}` }),
      ...list.map(t => themeCard(t, concept)),
      el("button", { class: "btn btn-outline btn-sm", type: "button", text: "+ Thema toevoegen", onclick: () => {
        if (!concept._saved) return setStatus(statusNode, "Sla het concept eerst op", true);
        themes.push({ id: crypto.randomUUID(), concept_id: concept.id, name: "", slug: "", emoji: "🎈", tagline: "", description: "",
          color_from: "#E9DCC9", color_to: "#D9BD97", published: false, sort_order: list.length + 1 });
        render();
      } })
    );
  }

  function render() {
    root.replaceChildren(
      ...(concepts.length ? concepts.sort((a, b) => a.sort_order - b.sort_order).map(conceptCard)
        : [el("div", { class: "empty", text: "Nog geen concepten. Voer eerst schema-v2.sql uit in Supabase." })]),
      el("button", { class: "btn btn-outline btn-sm", type: "button", text: "+ Concept toevoegen", onclick: () => {
        concepts.push({ id: crypto.randomUUID(), name: "", slug: "", emoji: "🎈", tagline: "", description: "",
          color_from: "#E9DCC9", color_to: "#D9BD97", price_unit: "", pricing_intro: "", pricing: [], pricing_note: "",
          included: [], info_sections: [], published: false, sort_order: concepts.length + 1 });
        render();
      } })
    );
  }

  async function load(container) {
    root = container;
    root.replaceChildren(el("div", { class: "empty", text: "Laden…" }));
    const [c, t, m] = await Promise.all([
      supabaseClient.from("concepts").select("*").order("sort_order"),
      supabaseClient.from("party_themes").select("*").order("sort_order"),
      supabaseClient.from("theme_media").select("*").order("sort_order")
    ]);
    if (c.error || t.error || m.error) {
      console.error(c.error || t.error || m.error);
      root.replaceChildren(el("div", { class: "empty", text: "Kon concepten niet laden. Is schema-v2.sql al uitgevoerd in Supabase?" }));
      return;
    }
    concepts = c.data.map(x => ({ ...x, _saved: true }));
    themes = t.data.map(x => ({ ...x, _saved: true }));
    media = m.data;
    render();
  }

  return { load };
})();
