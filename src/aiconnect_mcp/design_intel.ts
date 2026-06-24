// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Prakhar Gupta.
//
// Design-intelligence layer for AIConnect: palettes, perceptual color scales,
// WCAG contrast + accessible auto-fix, font pairing, theme/token generation,
// icon search (Iconify), and stock image search (Openverse). Everything here is
// ZERO-DEPENDENCY and KEYLESS — pure color math + keyless public APIs over the
// global fetch — to stay fully local and bug-resistant, on-brand for AIConnect.

// ---------------------------------------------------------------------------
// Color types
// ---------------------------------------------------------------------------
export interface RGB { r: number; g: number; b: number } // 0..1 (Figma's RGB)
export interface OKLCH { l: number; c: number; h: number }

// ---- sRGB <-> linear ------------------------------------------------------
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

// ---- hex parsing / formatting ---------------------------------------------
export function parseColor(input: string): RGB {
  if (!input) throw new Error("empty color");
  let s = input.trim().toLowerCase();
  // rgb()/rgba()
  const rgbM = s.match(/^rgba?\(([^)]+)\)$/);
  if (rgbM) {
    const parts = rgbM[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: (parts[0] || 0) / 255, g: (parts[1] || 0) / 255, b: (parts[2] || 0) / 255 };
  }
  if (s in NAMED) s = NAMED[s];
  s = s.replace(/^#/, "");
  if (s.length === 3) s = s.split("").map((ch) => ch + ch).join("");
  if (s.length === 6 || s.length === 8) {
    const r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) throw new Error(`bad hex: ${input}`);
    return { r: r / 255, g: g / 255, b: b / 255 };
  }
  throw new Error(`unrecognized color: ${input}`);
}
const ch = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
export const toHex = (c: RGB) => `#${ch(c.r)}${ch(c.g)}${ch(c.b)}`;
const inGamut = (c: RGB) => [c.r, c.g, c.b].every((v) => v >= -1e-4 && v <= 1 + 1e-4);

// A tiny named-color set so brand descriptions resolved to common names work.
const NAMED: Record<string, string> = {
  white: "#ffffff", black: "#000000", red: "#ff0000", green: "#008000", blue: "#0000ff",
  cornflowerblue: "#6495ed", teal: "#008080", indigo: "#4b0082", orange: "#ffa500",
  purple: "#800080", crimson: "#dc143c", gold: "#ffd700", slate: "#64748b", navy: "#000080",
};

// ---- OKLab / OKLCH (Björn Ottosson) ---------------------------------------
export function rgbToOklch(c: RGB): OKLCH {
  const r = toLin(c.r), g = toLin(c.g), b = toLin(c.b);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { l: L, c: C, h: H };
}
function oklchToRgbRaw(o: OKLCH): RGB {
  const hr = (o.h * Math.PI) / 180;
  const A = o.c * Math.cos(hr), B = o.c * Math.sin(hr);
  const l_ = o.l + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = o.l - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = o.l - 0.0894841775 * A - 1.291485548 * B;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return { r: toSrgb(r), g: toSrgb(g), b: toSrgb(b) };
}
// Gamut-map by reducing chroma until the color fits sRGB (avoids clipping to mud).
export function oklchToRgb(o: OKLCH): RGB {
  let raw = oklchToRgbRaw(o);
  if (inGamut(raw)) return clamp01(raw);
  let lo = 0, hi = o.c;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    raw = oklchToRgbRaw({ ...o, c: mid });
    if (inGamut(raw)) lo = mid; else hi = mid;
  }
  return clamp01(oklchToRgbRaw({ ...o, c: lo }));
}
const clamp01 = (c: RGB): RGB => ({ r: clmp(c.r), g: clmp(c.g), b: clmp(c.b) });
const clmp = (v: number) => Math.max(0, Math.min(1, v));

// ---------------------------------------------------------------------------
// WCAG contrast
// ---------------------------------------------------------------------------
function relLum(c: RGB): number {
  return 0.2126 * toLin(c.r) + 0.7152 * toLin(c.g) + 0.0722 * toLin(c.b);
}
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relLum(a), lb = relLum(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
export function checkContrast(fgIn: string, bgIn: string, opts: { fixTarget?: "AA" | "AAA"; autoFix?: boolean } = {}) {
  const fg = parseColor(fgIn), bg = parseColor(bgIn);
  const ratio = contrastRatio(fg, bg);
  const r = +ratio.toFixed(2);
  const result: any = {
    foreground: toHex(fg), background: toHex(bg), ratio: r,
    AA: { normalText: r >= 4.5, largeText: r >= 3.0 },
    AAA: { normalText: r >= 7.0, largeText: r >= 4.5 },
  };
  const target = opts.fixTarget === "AAA" ? 7.0 : 4.5;
  if (opts.autoFix !== false && r < target) {
    // Hold hue/chroma; walk lightness toward whichever pole raises contrast.
    const o = rgbToOklch(fg);
    const goDark = relLum(bg) > 0.5;
    let best: { rgb: RGB; ratio: number } | null = null;
    for (let i = 1; i <= 100; i++) {
      const l = goDark ? o.l * (1 - i / 100) : o.l + (1 - o.l) * (i / 100);
      const cand = oklchToRgb({ ...o, l: Math.max(0, Math.min(1, l)) });
      const cr = contrastRatio(cand, bg);
      if (cr >= target) { best = { rgb: cand, ratio: cr }; break; }
      best = { rgb: cand, ratio: cr };
    }
    if (best) {
      result.suggestion = {
        hex: toHex(best.rgb), figmaRGB: round3(best.rgb), newRatio: +best.ratio.toFixed(2),
        note: `Adjusted foreground lightness ${goDark ? "down" : "up"} to reach ${opts.fixTarget || "AA"} on this background.`,
      };
    }
  }
  return result;
}
const round3 = (c: RGB): RGB => ({ r: +c.r.toFixed(4), g: +c.g.toFixed(4), b: +c.b.toFixed(4) });

// ---------------------------------------------------------------------------
// Palette generation
// ---------------------------------------------------------------------------
// Perceptual lightness targets per Tailwind-style step (50..950).
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const L_CURVE = [0.971, 0.936, 0.885, 0.808, 0.704, 0.612, 0.531, 0.453, 0.376, 0.314, 0.257];
const HARMONY_ROT: Record<string, number[]> = {
  complementary: [180], analogous: [-30, 30], triadic: [-120, 120],
  tetradic: [90, 180, 270], "split-complementary": [150, 210],
};

export function colorScale(seedHex: string): { step: number; hex: string; figmaRGB: RGB; onWhite: number; onBlack: number }[] {
  const o = rgbToOklch(parseColor(seedHex));
  const baseC = o.c || 0.12;
  return STEPS.map((step, i) => {
    const t = i / (STEPS.length - 1);
    const c = baseC * (0.4 + 0.6 * Math.sin(t * Math.PI));
    const rgb = oklchToRgb({ l: L_CURVE[i], c, h: o.h });
    return {
      step, hex: toHex(rgb), figmaRGB: round3(rgb),
      onWhite: +contrastRatio(rgb, { r: 1, g: 1, b: 1 }).toFixed(2),
      onBlack: +contrastRatio(rgb, { r: 0, g: 0, b: 0 }).toFixed(2),
    };
  });
}

export function generatePalette(seed: string, opts: { harmonies?: string[]; includeGray?: boolean } = {}) {
  const seedRgb = parseColor(seed);
  const o = rgbToOklch(seedRgb);
  const harmonies = opts.harmonies && opts.harmonies.length ? opts.harmonies : ["complementary", "analogous", "triadic"];
  const harmonyOut: Record<string, { hex: string; figmaRGB: RGB }[]> = {};
  for (const name of harmonies) {
    const rots = HARMONY_ROT[name];
    if (!rots) continue;
    harmonyOut[name] = rots.map((rot) => {
      const rgb = oklchToRgb({ l: o.l, c: o.c, h: (o.h + rot + 360) % 360 });
      return { hex: toHex(rgb), figmaRGB: round3(rgb) };
    });
  }
  const out: any = {
    seed: { hex: toHex(seedRgb), oklch: { l: +o.l.toFixed(3), c: +o.c.toFixed(3), h: +o.h.toFixed(1) }, figmaRGB: round3(seedRgb) },
    harmonies: harmonyOut,
    scale: colorScale(seed),
  };
  if (opts.includeGray !== false) {
    // Hue-matched gray: same hue, very low chroma.
    out.gray = STEPS.map((step, i) => {
      const rgb = oklchToRgb({ l: L_CURVE[i], c: Math.min(o.c, 0.04) * (0.4 + 0.6 * Math.sin((i / 10) * Math.PI)), h: o.h });
      return { step, hex: toHex(rgb), figmaRGB: round3(rgb) };
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Font pairing (curated, offline, Figma-ready). Google Fonts are available in
// Figma by default, so we only need to return correct {family, style}.
// ---------------------------------------------------------------------------
interface Pairing { heading: string; body: string; vibes: string[]; rationale: string }
const PAIRINGS: Pairing[] = [
  { heading: "Playfair Display", body: "Source Sans 3", vibes: ["editorial", "luxury", "elegant", "fashion"], rationale: "High-contrast serif display over a clean humanist sans — classic editorial elegance." },
  { heading: "Fraunces", body: "Inter", vibes: ["editorial", "warm", "premium", "brand"], rationale: "Soft modern serif with a neutral grotesque body for warm, premium brands." },
  { heading: "Space Grotesk", body: "Inter", vibes: ["modern", "fintech", "tech", "startup"], rationale: "Geometric techy display with the workhorse UI sans Inter." },
  { heading: "Sora", body: "Inter", vibes: ["fintech", "saas", "modern", "clean"], rationale: "Crisp geometric headings; Inter keeps body text dense and legible." },
  { heading: "Clash Display", body: "Work Sans", vibes: ["bold", "agency", "creative"], rationale: "Punchy display paired with a friendly low-contrast sans." },
  { heading: "Archivo", body: "Roboto", vibes: ["sport", "bold", "industrial"], rationale: "Condensed-friendly grotesque with the ubiquitous Roboto body." },
  { heading: "DM Serif Display", body: "DM Sans", vibes: ["elegant", "editorial", "minimal"], rationale: "Same family system — serif display + matching sans for harmony." },
  { heading: "Poppins", body: "Inter", vibes: ["playful", "friendly", "consumer", "app"], rationale: "Rounded geometric headings; Inter grounds the body." },
  { heading: "Lora", body: "Source Sans 3", vibes: ["editorial", "calm", "reading", "blog"], rationale: "Readable contemporary serif for long-form, neutral sans for UI." },
  { heading: "Syne", body: "Inter", vibes: ["creative", "art", "experimental"], rationale: "Quirky display for art/portfolio sites; Inter restores readability." },
  { heading: "IBM Plex Sans", body: "IBM Plex Sans", vibes: ["tech", "enterprise", "neutral", "developer"], rationale: "Single super-family — weights create hierarchy, maximum consistency." },
  { heading: "Bricolage Grotesque", body: "Inter", vibes: ["modern", "trendy", "startup", "2026"], rationale: "On-trend characterful grotesque with a neutral body." },
];
const BODY_SAFE = ["Inter", "Roboto", "Source Sans 3", "Work Sans", "DM Sans", "IBM Plex Sans"];
export function suggestFonts(vibe: string, count = 3) {
  const v = (vibe || "").toLowerCase();
  const scored = PAIRINGS.map((p) => ({ p, score: p.vibes.reduce((s, k) => s + (v.includes(k) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0].score > 0 ? scored.filter((s) => s.score > 0) : scored;
  const chosen = top.slice(0, Math.max(1, Math.min(count, 6))).map(({ p }) => ({
    heading: { family: p.heading, figmaFontName: { family: p.heading, style: "Bold" } },
    body: { family: p.body, figmaFontName: { family: p.body, style: "Regular" } },
    rationale: p.rationale,
    availableInFigmaByDefault: true,
  }));
  return { vibe, pairings: chosen, note: "Google Fonts are bundled in Figma; apply with set_font_name. Body fallbacks: " + BODY_SAFE.join(", ") };
}

// ---------------------------------------------------------------------------
// Theme / token generation — returns a structure ready for create_variable*.
// ---------------------------------------------------------------------------
export function generateTheme(seed: string, opts: { appearance?: "light" | "dark" | "both"; radius?: string; vibe?: string } = {}) {
  const scale = colorScale(seed);
  const pal = generatePalette(seed, { harmonies: ["complementary"], includeGray: true });
  const byStep = (arr: any[], step: number) => arr.find((s) => s.step === step);
  const appearance = opts.appearance || "both";

  // Semantic color tokens mapped onto the scale (Radix-style intent).
  const semantic = (mode: "light" | "dark") => {
    const dark = mode === "dark";
    const s = (n: number) => byStep(scale, n).figmaRGB;
    const g = (n: number) => byStep(pal.gray, n).figmaRGB;
    return {
      "color/background": dark ? g(950) : { r: 1, g: 1, b: 1 },
      "color/surface": dark ? g(900) : g(50),
      "color/border": dark ? g(800) : g(200),
      "color/primary": s(dark ? 400 : 500),
      "color/primary-hover": s(dark ? 300 : 600),
      "color/text": dark ? g(50) : g(900),
      "color/text-muted": dark ? g(300) : g(600),
    };
  };

  const radiusMap: Record<string, Record<string, number>> = {
    none: { sm: 0, md: 0, lg: 0, full: 0 },
    small: { sm: 2, md: 4, lg: 6, full: 9999 },
    medium: { sm: 4, md: 8, lg: 12, full: 9999 },
    large: { sm: 8, md: 12, lg: 20, full: 9999 },
  };
  const radius = radiusMap[opts.radius || "medium"];
  const spacing = { "space/1": 4, "space/2": 8, "space/3": 12, "space/4": 16, "space/6": 24, "space/8": 32, "space/12": 48 };

  const colorModes = appearance === "both" ? ["light", "dark"] : [appearance];
  const fonts = opts.vibe ? suggestFonts(opts.vibe, 1).pairings[0] : null;

  return {
    seedHex: toHex(parseColor(seed)),
    collections: [
      {
        name: "color", type: "COLOR", modes: colorModes,
        variables: Object.keys(semantic("light")).map((name) => ({
          name, type: "COLOR",
          valuesByMode: Object.fromEntries(colorModes.map((m) => [m, (semantic(m as any) as any)[name]])),
        })),
      },
      { name: "radius", type: "FLOAT", modes: ["value"], variables: Object.entries(radius).map(([k, v]) => ({ name: `radius/${k}`, type: "FLOAT", value: v })) },
      { name: "spacing", type: "FLOAT", modes: ["value"], variables: Object.entries(spacing).map(([k, v]) => ({ name: k, type: "FLOAT", value: v })) },
    ],
    primitiveScale: scale.map((s) => ({ name: `primary/${s.step}`, hex: s.hex, figmaRGB: s.figmaRGB })),
    fonts: fonts ? { heading: fonts.heading.family, body: fonts.body.family } : undefined,
    apply: "Feed collections into create_variable_collection + create_variable. Free Figma plans cap color at 1 mode — the second mode is skipped automatically.",
  };
}

// ---------------------------------------------------------------------------
// Iconify (keyless) — search + fetch SVG
// ---------------------------------------------------------------------------
export async function searchIcons(query: string, limit = 24) {
  const url = `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=${Math.min(limit, 64)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Iconify search failed: ${r.status}`);
  const data: any = await r.json();
  return { total: data.total, icons: (data.icons || []).slice(0, limit), collections: Object.keys(data.collections || {}) };
}
export async function fetchIconSvg(name: string, opts: { color?: string; size?: number } = {}): Promise<string> {
  // name format: "prefix:icon" (e.g. "lucide:home")
  const [prefix, icon] = name.split(":");
  if (!prefix || !icon) throw new Error(`icon name must be "prefix:icon", got "${name}"`);
  const params = new URLSearchParams();
  if (opts.color) params.set("color", opts.color);
  if (opts.size) { params.set("width", String(opts.size)); params.set("height", String(opts.size)); }
  const url = `https://api.iconify.design/${prefix}/${icon}.svg${params.toString() ? "?" + params : ""}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Iconify fetch failed: ${r.status}`);
  const svg = await r.text();
  if (!svg.includes("<svg")) throw new Error(`icon not found: ${name}`);
  return svg;
}

// ---------------------------------------------------------------------------
// Openverse (keyless) — stock/CC image search. Returns URLs usable by
// set_image_fill (which fetches imageUrl -> base64 server-side already).
// ---------------------------------------------------------------------------
export async function searchImages(query: string, opts: { count?: number; orientation?: string } = {}) {
  const count = Math.min(opts.count || 6, 20);
  const params = new URLSearchParams({ q: query, page_size: String(count), license_type: "all" });
  if (opts.orientation) params.set("aspect_ratio", opts.orientation === "landscape" ? "wide" : opts.orientation === "portrait" ? "tall" : "square");
  const r = await fetch(`https://api.openverse.org/v1/images/?${params}`, { headers: { "User-Agent": "AIConnect-Figma-MCP" } });
  if (!r.ok) throw new Error(`Openverse search failed: ${r.status}`);
  const data: any = await r.json();
  return {
    provider: "openverse",
    results: (data.results || []).slice(0, count).map((x: any) => ({
      url: x.url, thumbUrl: x.thumbnail, width: x.width, height: x.height,
      title: x.title, author: x.creator, sourceUrl: x.foreign_landing_url, license: `${x.license} ${x.license_version || ""}`.trim(),
    })),
    note: "Pass a result.url to set_image_fill (it fetches & encodes server-side). Credit author/license where shown.",
  };
}

// ---------------------------------------------------------------------------
// Brand identity profiles — the "designer-loved" layer. A brand profile bundles
// a seed color + recommended fonts + radius into a reusable identity. Pass a
// preset id, a famous brand name, or a custom seed; buildBrand() returns a full
// theme ready to materialize as Figma variables in one shot.
// ---------------------------------------------------------------------------
export interface BrandPreset {
  id: string; name: string; description: string;
  primary: string; vibe: string; heading: string; body: string; radius: string;
}
export const BRAND_PRESETS: BrandPreset[] = [
  { id: "fintech-trust", name: "Fintech Trust", description: "Confident indigo, geometric sans — banking, SaaS, dashboards.", primary: "#635BFF", vibe: "fintech modern saas", heading: "Space Grotesk", body: "Inter", radius: "medium" },
  { id: "eco-natural", name: "Eco Natural", description: "Grounded green, humanist type — sustainability, wellness, food.", primary: "#2F9E44", vibe: "calm natural friendly", heading: "Fraunces", body: "Inter", radius: "large" },
  { id: "luxury-noir", name: "Luxury Noir", description: "Gold on near-black, high-contrast serif — premium, fashion, spirits.", primary: "#C8A04F", vibe: "luxury elegant editorial fashion", heading: "Playfair Display", body: "Source Sans 3", radius: "small" },
  { id: "playful-coral", name: "Playful Coral", description: "Warm coral, rounded geometric — consumer apps, social, kids.", primary: "#FF6B6B", vibe: "playful friendly consumer app", heading: "Poppins", body: "Inter", radius: "large" },
  { id: "editorial-ink", name: "Editorial Ink", description: "Near-black ink, contemporary serif — publications, blogs, long-form.", primary: "#1A1A2E", vibe: "editorial calm reading blog", heading: "Lora", body: "Source Sans 3", radius: "small" },
  { id: "health-calm", name: "Health Calm", description: "Soft teal, clean sans — healthcare, meditation, clinics.", primary: "#0CA5A5", vibe: "calm clean health modern", heading: "Sora", body: "Inter", radius: "medium" },
  { id: "bold-agency", name: "Bold Agency", description: "Stark black, punchy display — creative agencies, portfolios.", primary: "#111111", vibe: "bold agency creative experimental", heading: "Clash Display", body: "Work Sans", radius: "none" },
  { id: "sunset-warm", name: "Sunset Warm", description: "Energetic orange, friendly grotesque — travel, events, lifestyle.", primary: "#FB8500", vibe: "warm friendly bold", heading: "Bricolage Grotesque", body: "Inter", radius: "medium" },
  { id: "enterprise-neutral", name: "Enterprise Neutral", description: "Steady blue-gray, IBM Plex — enterprise, developer tools.", primary: "#2563EB", vibe: "tech enterprise neutral developer", heading: "IBM Plex Sans", body: "IBM Plex Sans", radius: "small" },
];

// Famous brand colors — exact hex codes designers reach for as references/seeds.
export const FAMOUS_BRAND_COLORS: Record<string, string> = {
  stripe: "#635BFF", spotify: "#1DB954", slack: "#4A154B", airbnb: "#FF5A5F", figma: "#F24E1E",
  notion: "#000000", linear: "#5E6AD2", vercel: "#000000", shopify: "#96BF48", twitch: "#9146FF",
  discord: "#5865F2", netflix: "#E50914", youtube: "#FF0000", instagram: "#E4405F", twitter: "#1DA1F2",
  facebook: "#1877F2", linkedin: "#0A66C2", whatsapp: "#25D366", uber: "#000000", airtable: "#18BFFF",
  dropbox: "#0061FF", coinbase: "#0052FF", robinhood: "#00C805", revolut: "#0666EB", duolingo: "#58CC02",
  mailchimp: "#FFE01B", asana: "#F06A6A", trello: "#0079BF", gitlab: "#FC6D26", github: "#181717",
  google: "#4285F4", microsoft: "#5E5E5E", apple: "#000000", amazon: "#FF9900", paypal: "#003087",
};

export function listBrandPresets() {
  return {
    presets: BRAND_PRESETS.map((p) => ({ id: p.id, name: p.name, description: p.description, primary: p.primary, fonts: { heading: p.heading, body: p.body }, radius: p.radius })),
    famousBrandColors: FAMOUS_BRAND_COLORS,
    usage: "apply_brand with { preset:'fintech-trust' } | { brand:'stripe' } | { primary:'#635BFF', vibe:'...', heading, body, radius }.",
  };
}

// Resolve a brand spec to a seed + fonts + radius, then build the full theme.
export function buildBrand(opts: { preset?: string; brand?: string; primary?: string; vibe?: string; heading?: string; body?: string; radius?: string; appearance?: "light" | "dark" | "both" }) {
  let preset: BrandPreset | undefined;
  if (opts.preset) {
    preset = BRAND_PRESETS.find((p) => p.id === opts.preset || p.name.toLowerCase() === opts.preset!.toLowerCase());
    if (!preset) throw new Error(`Unknown preset "${opts.preset}". Options: ${BRAND_PRESETS.map((p) => p.id).join(", ")}`);
  }
  let seed = opts.primary || (preset && preset.primary);
  if (!seed && opts.brand) {
    const key = opts.brand.toLowerCase();
    seed = FAMOUS_BRAND_COLORS[key];
    if (!seed) throw new Error(`Unknown brand "${opts.brand}". Try one of: ${Object.keys(FAMOUS_BRAND_COLORS).slice(0, 12).join(", ")}…`);
  }
  if (!seed) throw new Error("Provide one of: preset, brand, or primary.");

  const vibe = opts.vibe || (preset && preset.vibe) || "modern";
  const radius = opts.radius || (preset && preset.radius) || "medium";
  const theme = generateTheme(seed, { appearance: opts.appearance || "both", radius, vibe });
  // Prefer explicit fonts, else preset fonts, else vibe-derived.
  const heading = opts.heading || (preset && preset.heading) || (theme.fonts && theme.fonts.heading);
  const body = opts.body || (preset && preset.body) || (theme.fonts && theme.fonts.body);
  return {
    brand: {
      name: (preset && preset.name) || opts.brand || "Custom",
      seedHex: theme.seedHex, vibe, radius,
      fonts: { heading, body },
    },
    theme,
  };
}

// ---------------------------------------------------------------------------
// LOCAL "Content Reel" — realistic placeholder replacement. Pure, zero-dep,
// fully offline (no API call): a local-compute superpower a cloud peer lacks.
// Pools are small & hand-rolled; composition (emails/phones/dates/prices) is
// derived so output stays varied but believable.
// ---------------------------------------------------------------------------
const FIRST_NAMES = [
  "Ava", "Liam", "Noah", "Emma", "Olivia", "Sophia", "Mason", "Lucas", "Mia", "Amelia",
  "Ethan", "Aria", "Leo", "Maya", "Isla", "Kai", "Zoe", "Owen", "Nora", "Theo",
  "Ruby", "Eli", "Hana", "Diego", "Priya", "Arjun", "Yuki", "Omar", "Lena", "Finn",
  "Ines", "Mateo", "Sana", "Nico", "Freya", "Hugo", "Aisha", "Jonas", "Lara", "Idris",
];
const LAST_NAMES = [
  "Carter", "Nguyen", "Patel", "Kim", "Silva", "Rossi", "Haddad", "Okafor", "Ivanov", "Tanaka",
  "Mendez", "Larsson", "Cohen", "Ali", "Fischer", "Moreau", "Costa", "Reyes", "Singh", "Walsh",
  "Bauer", "Novak", "Romero", "Sharma", "Dubois", "Mwangi", "Yamamoto", "Khan", "Petrov", "Lopez",
  "Berg", "Adler", "Cruz", "Wagner", "Bianchi", "Holt", "Farah", "Vega", "Park", "Sato",
];
const COMPANIES = [
  "Northwind Labs", "Lumen Works", "Atlas Studio", "Verda Health", "Pierpoint", "Kestrel AI",
  "Tidal Bank", "Maple & Co", "Orbit Foods", "Cobalt Systems", "Harbor Press", "Nimbus Cloud",
  "Solstice Wear", "Granite Realty", "Echo Mobility", "Fern & Field", "Quanta Devices", "Vista Travel",
  "Beacon Energy", "Loom Software", "Pivot Logistics", "Aster Pharma", "Junction Coffee", "Helio Motors",
];
const CITIES = [
  "Austin", "Lisbon", "Toronto", "Berlin", "Singapore", "Nairobi", "Melbourne", "Bogotá",
  "Amsterdam", "Seoul", "Dublin", "Mumbai", "Oslo", "Cairo", "Vancouver", "Kyoto",
  "Barcelona", "Helsinki", "Cape Town", "Denver", "Prague", "Auckland", "Warsaw", "Bangalore",
];
const ROLES = [
  "Product Designer", "Software Engineer", "Marketing Lead", "Data Analyst", "UX Researcher",
  "Founder & CEO", "Account Manager", "Content Strategist", "Head of Growth", "Solutions Architect",
  "Operations Manager", "Brand Director", "Frontend Developer", "Customer Success Lead", "Finance Partner",
];
const DOMAINS = ["example.com", "acme.co", "mail.com", "company.io", "studio.design", "labs.dev"];
const SENTENCES = [
  "Build, test, and ship beautiful interfaces faster than ever.",
  "Everything your team needs to move from idea to launch.",
  "Trusted by thousands of teams to power their daily work.",
  "Designed for clarity, built for scale, loved by users.",
  "Turn complex workflows into simple, delightful experiences.",
  "Real results, measurable impact, no guesswork required.",
  "Collaborate in real time and keep everyone in sync.",
  "Secure by default, flexible by design, fast everywhere.",
];
const PRODUCTS = [
  "Wireless Headphones", "Ceramic Mug", "Linen Throw", "Trail Backpack", "Desk Lamp",
  "Cotton Tee", "Leather Wallet", "Smart Bottle", "Wool Beanie", "Field Notebook",
];

// Cheap deterministic-ish PRNG seeded per call so repeated runs aren't identical
// but a single batch is internally varied. Uses Math.random by default.
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const pad2 = (n: number) => String(n).padStart(2, "0");

// Classify a layer name / current text into a content "kind".
export type ContentKind =
  | "name" | "firstName" | "lastName" | "email" | "phone" | "company"
  | "role" | "city" | "date" | "price" | "product" | "username" | "url" | "sentence";

export function classifyHint(hint: string): ContentKind {
  const h = (hint || "").toLowerCase();
  const has = (...ks: string[]) => ks.some((k) => h.includes(k));
  if (has("email", "e-mail", "mail")) return "email";
  if (has("phone", "tel", "mobile", "cell")) return "phone";
  if (has("company", "org", "business", "brand")) return "company";
  if (has("role", "title", "position", "job")) return "role";
  if (has("city", "location", "address", "town")) return "city";
  if (has("date", "joined", "posted", "created", "published")) return "date";
  if (has("price", "cost", "amount", "$", "usd", "total")) return "price";
  if (has("product", "item", "sku")) return "product";
  if (has("username", "handle", "@")) return "username";
  if (has("url", "link", "website", "site", "domain")) return "url";
  if (has("firstname", "first name", "given")) return "firstName";
  if (has("lastname", "last name", "surname", "family")) return "lastName";
  if (has("name", "fullname", "full name", "author", "customer", "user", "person", "contact")) return "name";
  return "sentence";
}

function genValue(kind: ContentKind): string {
  const fn = pick(FIRST_NAMES), ln = pick(LAST_NAMES);
  switch (kind) {
    case "firstName": return fn;
    case "lastName": return ln;
    case "name": return `${fn} ${ln}`;
    case "email": return `${fn}.${ln}`.toLowerCase().replace(/[^a-z.]/g, "") + "@" + pick(DOMAINS);
    case "username": return "@" + (fn + ln).toLowerCase().replace(/[^a-z]/g, "") + (Math.floor(Math.random() * 90) + 10);
    case "phone": return `+1 (${Math.floor(Math.random() * 800) + 200}) ${Math.floor(Math.random() * 900) + 100}-${pad2(Math.floor(Math.random() * 100))}${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)}`;
    case "company": return pick(COMPANIES);
    case "role": return pick(ROLES);
    case "city": return pick(CITIES);
    case "url": return "https://" + pick(COMPANIES).toLowerCase().replace(/[^a-z]/g, "") + "." + pick(["com", "io", "co", "design"]);
    case "product": return pick(PRODUCTS);
    case "date": {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${pick(months)} ${Math.floor(Math.random() * 28) + 1}, ${2023 + Math.floor(Math.random() * 3)}`;
    }
    case "price": {
      const dollars = Math.floor(Math.random() * 480) + 9;
      return `$${dollars}.${pick(["00", "99", "49", "95"])}`;
    }
    case "sentence":
    default: return pick(SENTENCES);
  }
}

// PURE, unit-testable: given fields {id, hint} (hint = layer name and/or current
// text), return [{id, kind, text}] with realistic generated content.
export function generateContent(
  fields: { id: string; hint?: string }[]
): { id: string; kind: ContentKind; text: string }[] {
  return (fields || []).map((f) => {
    const kind = classifyHint(f.hint || "");
    return { id: f.id, kind, text: genValue(kind) };
  });
}

// ---------------------------------------------------------------------------
// LOCAL design-token import — read a tokens file off the FILESYSTEM and parse
// it into a flat token list ready to materialize as Figma variables. Supports
// DTCG (W3C), Tailwind-ish config, and CSS custom properties. Pure parser; the
// server tool handles the fs read + create_variable calls.
// ---------------------------------------------------------------------------
export type TokenType = "COLOR" | "FLOAT" | "STRING";
export interface ParsedToken { name: string; type: TokenType; value: any } // COLOR value = {r,g,b,a}
export type TokenFormat = "dtcg" | "tailwind" | "cssvars";

// Color string -> Figma {r,g,b,a}. Returns null if not parseable.
function tryColor(v: string): { r: number; g: number; b: number; a: number } | null {
  try {
    const s = String(v).trim();
    // rgba alpha capture (parseColor drops alpha)
    let a = 1;
    const m = s.match(/^rgba?\(([^)]+)\)$/i);
    if (m) { const p = m[1].split(/[,\s/]+/).filter(Boolean); if (p.length >= 4) a = Number(p[3]); }
    if (s.length === 9 && s[0] === "#") a = parseInt(s.slice(7, 9), 16) / 255; // #rrggbbaa
    const c = parseColor(s);
    return { r: +c.r.toFixed(4), g: +c.g.toFixed(4), b: +c.b.toFixed(4), a: +a.toFixed(4) };
  } catch { return null; }
}
// Numeric (with optional unit like px/rem) -> FLOAT in px-ish units.
function tryFloat(v: any): number | null {
  if (typeof v === "number") return v;
  const m = String(v).trim().match(/^(-?\d*\.?\d+)\s*(px|rem|em|pt|%)?$/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2] === "rem" || m[2] === "em") n *= 16; // assume 16px root
  return n;
}

// --- DTCG (W3C design tokens): nested objects with {$value,$type}; references
// are "{path.to.token}". We resolve aliases against the flattened map.
function looksDtcg(o: any): boolean {
  let found = false;
  const walk = (n: any) => {
    if (found || !n || typeof n !== "object") return;
    if ("$value" in n) { found = true; return; }
    for (const k of Object.keys(n)) walk(n[k]);
  };
  walk(o);
  return found;
}
function parseDtcg(obj: any): ParsedToken[] {
  // First pass: collect raw {path -> {value, type}} (type may inherit from group $type).
  const raw: Record<string, { value: any; type?: string }> = {};
  const walk = (node: any, path: string[], inheritedType?: string) => {
    if (!node || typeof node !== "object") return;
    const groupType = node.$type || inheritedType;
    if ("$value" in node) { raw[path.join(".")] = { value: node.$value, type: node.$type || inheritedType }; return; }
    for (const k of Object.keys(node)) {
      if (k.startsWith("$")) continue;
      walk(node[k], [...path, k], groupType);
    }
  };
  walk(obj, []);
  // Resolve "{alias}" references (single full-string aliases), up to a few hops.
  const resolve = (val: any, depth = 0): any => {
    if (depth > 10 || typeof val !== "string") return val;
    const m = val.match(/^\{([^}]+)\}$/);
    if (!m) return val;
    const target = raw[m[1]];
    return target ? resolve(target.value, depth + 1) : val;
  };
  const out: ParsedToken[] = [];
  for (const name of Object.keys(raw)) {
    const resolved = resolve(raw[name].value);
    const declared = (raw[name].type || "").toLowerCase();
    let type: TokenType, value: any;
    if (declared === "color" || (!declared && tryColor(resolved))) {
      const c = tryColor(resolved); if (!c) continue; type = "COLOR"; value = c;
    } else if (["dimension", "number", "spacing", "fontsize", "borderradius", "sizing"].includes(declared) || (!declared && tryFloat(resolved) != null)) {
      const n = tryFloat(resolved); if (n == null) continue; type = "FLOAT"; value = n;
    } else {
      type = "STRING"; value = String(resolved);
    }
    out.push({ name: name.replace(/\./g, "/"), type, value });
  }
  return out;
}

// --- Tailwind-ish config: { theme: { colors:{...}, spacing:{...}, ... } } with
// possibly nested color shades. Flatten to color/spacing tokens.
function parseTailwind(obj: any): ParsedToken[] {
  const theme = (obj && (obj.theme || obj.extend || obj)) || {};
  const out: ParsedToken[] = [];
  const flattenColors = (node: any, path: string[]) => {
    if (node && typeof node === "object") {
      for (const k of Object.keys(node)) flattenColors(node[k], [...path, k]);
    } else {
      const c = tryColor(String(node));
      if (c) out.push({ name: ["color", ...path].join("/"), type: "COLOR", value: c });
    }
  };
  if (theme.colors) flattenColors(theme.colors, []);
  const numGroup = (group: any, prefix: string) => {
    if (!group || typeof group !== "object") return;
    for (const k of Object.keys(group)) {
      const n = tryFloat(group[k]);
      if (n != null) out.push({ name: `${prefix}/${k}`, type: "FLOAT", value: n });
    }
  };
  numGroup(theme.spacing, "spacing");
  numGroup(theme.borderRadius || theme.borderradius, "radius");
  numGroup(theme.fontSize || theme.fontsize, "fontSize");
  return out;
}

// --- CSS custom properties: parse `:root { --name: value; }` (and any block).
function parseCssVars(text: string): ParsedToken[] {
  const out: ParsedToken[] = [];
  for (const m of text.matchAll(/--([\w-]+)\s*:\s*([^;}]+)\s*[;}]/g)) {
    const name = m[1].trim();
    const val = m[2].trim();
    const c = tryColor(val);
    if (c) { out.push({ name: `css/${name}`, type: "COLOR", value: c }); continue; }
    const n = tryFloat(val);
    if (n != null) { out.push({ name: `css/${name}`, type: "FLOAT", value: n }); continue; }
    out.push({ name: `css/${name}`, type: "STRING", value: val });
  }
  return out;
}

// PURE, unit-testable. Accepts a string (JSON or CSS) or an already-parsed
// object. `format` 'auto' sniffs DTCG vs Tailwind vs CSS.
export function parseTokensFile(
  input: string | object,
  format: "auto" | TokenFormat = "auto"
): { tokens: ParsedToken[]; format: TokenFormat } {
  let obj: any = null;
  let text = "";
  if (typeof input === "string") {
    text = input;
    const t = input.trim();
    if (t.startsWith("{") || t.startsWith("[")) { try { obj = JSON.parse(t); } catch { /* not JSON */ } }
  } else {
    obj = input;
  }

  let fmt: TokenFormat;
  if (format !== "auto") fmt = format;
  else if (obj && looksDtcg(obj)) fmt = "dtcg";
  else if (obj && (obj.theme || obj.colors || obj.extend)) fmt = "tailwind";
  else fmt = "cssvars";

  let tokens: ParsedToken[];
  if (fmt === "dtcg") tokens = parseDtcg(obj || {});
  else if (fmt === "tailwind") tokens = parseTailwind(obj || {});
  else tokens = parseCssVars(text || (obj ? JSON.stringify(obj) : ""));

  return { tokens, format: fmt };
}
