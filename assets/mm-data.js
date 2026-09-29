/* ------------------------------------------------------------------
   Maison Moments — gegevens voor concepten en thema's
   ------------------------------------------------------------------
   Structuur:  concept (bv. Slaapfeestjes)  ->  thema's (bv. Wizard's Night)

   Prijzen, "inbegrepen" en praktische info staan op het concept en
   gelden voor al zijn thema's. Een thema kan ze overschrijven door
   hetzelfde veld zelf in te vullen.

   Voorlopig komt alles uit DEFAULT_CATALOG hieronder (demo-inhoud).
   In de volgende stap wordt dit beheerd via admin.html en geladen uit
   Supabase; DEFAULT_CATALOG blijft dan de terugval als Supabase niet
   bereikbaar is.
------------------------------------------------------------------- */

const SLEEPOVER_INFO = {
  priceFrom: 120,
  priceUnit: "per weekend",
  pricingIntro: "Alle prijzen gelden voor een volledig weekend, van vrijdagavond tot zondag, inclusief levering, opbouw, styling, afbraak en ophaling.",
  pricing: [
    { label: "2 tipi's", price: 120 },
    { label: "3 tipi's", price: 145 },
    { label: "4 tipi's", price: 170 },
    { label: "5 tipi's", price: 195 },
    { label: "6 tipi's", price: 220 }
  ],
  pricingNote: "Levering binnen 15 km is inbegrepen. Van 15 tot 30 km rekenen we €15 extra.",
  included: [
    "1 tipi per persoon",
    "1 luchtmatras per persoon",
    "1 hoofdkussen met kussensloop",
    "1 donsdeken met dekbedovertrek",
    "1 extra dekentje",
    "1 ontbijttafeltje",
    "Themadecoratie en sfeerverlichting",
    "Eén extra luchtmatras met elektrische pomp",
    "Extra batterijen voor de sfeerverlichting"
  ],
  infoSections: [
    {
      title: "Zo verloopt het weekend",
      body: "Op vrijdagavond leveren, bouwen en stylen we alles. Reken daarvoor op 1 à 2 uur, afhankelijk van het aantal tipi's. Op zondag breken we alles af en nemen we het terug mee."
    },
    {
      title: "Ruimte en levering",
      body: "Reken op ongeveer 1,5 m² vrije vloeroppervlakte per tipi. Zorg dat de ruimte vóór de levering vrij en proper is, en dat we vlak voor de deur kunnen parkeren om vlot en veilig te laden. Lukt parkeren voor de deur niet? Laat het ons vooraf weten, dan zoeken we samen een oplossing."
    },
    {
      title: "Voorschot en betaling",
      body: "Na onze bevestiging betaal je binnen 3 dagen een voorschot van €40. Daarmee is je reservatie definitief; het voorschot wordt verrekend met de huurprijs. Het resterende bedrag en de waarborg van €100 betaal je bij levering, vóór de opbouw, via Payconiq of onmiddellijke overschrijving. De waarborg krijg je binnen 5 werkdagen terug als alles volledig en onbeschadigd is."
    },
    {
      title: "Hygiëne",
      body: "Al het beddengoed wordt na iedere verhuur zorgvuldig gewassen."
    },
    {
      title: "Tijdens de week of een verlengd weekend?",
      body: "Een slaapfeestje in de schoolvakantie of tijdens een verlengd weekend is ook mogelijk. We bekijken het graag samen met jou."
    }
  ]
};

const DEFAULT_CATALOG = {
  concepts: [
    {
      slug: "slaapfeestjes",
      name: "Slaapfeestjes",
      emoji: "⛺",
      tagline: "Een tipi-sleepover in jouw woonkamer, volledig gestyled in het thema van je keuze.",
      description: "Wij leveren op vrijdag, bouwen en stylen alles, en halen het op zondag weer op. Jullie hoeven alleen nog te genieten.",
      cover: "zeemeermin.jpg",
      colorFrom: "#F6D9CE", colorTo: "#F2C4B3",
      ...SLEEPOVER_INFO
    }
  ],
  themes: [
    {
      slug: "wizards-night", concept: "slaapfeestjes",
      name: "Wizard's Night", emoji: "🪄",
      tagline: "Toverstokken, uilen en een sterrenhemel vol magie.",
      description: "Een betoverende nacht vol toverspreuken, kaarslicht en geheimzinnige details. Perfect voor kleine tovenaars en heksen.",
      colorFrom: "#CBD3E3", colorTo: "#9FAEC9",
      media: []
    },
    {
      slug: "space-explorer", concept: "slaapfeestjes",
      name: "Space Explorer", emoji: "🚀",
      tagline: "Een reis langs planeten, raketten en sterren.",
      description: "Klaar voor lancering! Tipi's vol sterrenlichtjes en planeten voor een nacht tussen de sterren.",
      colorFrom: "#D5D3E6", colorTo: "#8E8BB8",
      media: []
    },
    {
      slug: "over-the-rainbow", concept: "slaapfeestjes",
      name: "Over the Rainbow", emoji: "🌈",
      tagline: "Zachte pasteltinten en vrolijke regenbogen.",
      description: "Een kleurrijk en dromerig thema met pastelkleuren, wolkjes en regenbogen.",
      colorFrom: "#F1DDB0", colorTo: "#E3A857",
      media: []
    },
    {
      slug: "mermaids-magic", concept: "slaapfeestjes",
      name: "Mermaids Magic", emoji: "🧜‍♀️",
      tagline: "Schelpen, glitters en de magie van de zee.",
      description: "Duik in een onderwaterwereld vol zeemeerminnen, schelpen en parelmoerglans.",
      colorFrom: "#CFE0D6", colorTo: "#A9C4AE",
      cover: "zeemeermin.jpg",
      media: [{ type: "image", url: "zeemeermin.jpg", caption: "Mermaids Magic" }]
    },
    {
      slug: "the-equestrian-club", concept: "slaapfeestjes",
      name: "The Equestrian Club", emoji: "🐴",
      tagline: "Voor echte paardenliefhebbers.",
      description: "Rozetten, hoefijzers en warme natuurtinten voor een stijlvolle paardenpyjamaparty.",
      colorFrom: "#E8C9B3", colorTo: "#D9A98A",
      media: []
    }
  ]
};

/* ---------------- helpers ---------------- */
const MM = {
  async loadCatalog() {
    return DEFAULT_CATALOG;
  },

  // Waarde van het thema zelf, anders die van het concept.
  resolve(theme, concept, field) {
    const own = theme ? theme[field] : undefined;
    const hasOwn = Array.isArray(own) ? own.length > 0 : own !== undefined && own !== null && own !== "";
    return hasOwn ? own : concept ? concept[field] : undefined;
  },

  param(name) {
    return new URLSearchParams(location.search).get(name);
  },

  // Alle tekst uit de database gaat door esc() voor ze in de pagina komt.
  esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },

  euro(n) {
    return "€" + Number(n).toLocaleString("nl-BE", { maximumFractionDigits: 2 });
  },

  // Achtergrond voor een tegel: foto als die er is, anders het kleurverloop.
  tileBackground(item) {
    if (item.cover) return `background-image:url('${encodeURI(item.cover).replace(/'/g, "%27")}')`;
    return `background:linear-gradient(140deg, ${MM.color(item.colorFrom, "#E9DCC9")}, ${MM.color(item.colorTo, "#D9BD97")})`;
  },

  color(value, fallback) {
    return /^#[0-9a-f]{3,8}$/i.test(value || "") ? value : fallback;
  },

  initMenu() {
    const toggle = document.getElementById("menuToggle");
    const links = document.getElementById("navLinks");
    if (!toggle || !links) return;
    toggle.addEventListener("click", () => links.classList.toggle("open"));
    links.querySelectorAll("a").forEach(a => a.addEventListener("click", () => links.classList.remove("open")));
  }
};
