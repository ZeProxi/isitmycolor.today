/**
 * Known colors the hotline uses, with a display swatch.
 * The site prints colors as "english/spanish" (e.g. "green/verde").
 * We key everything by the lowercase English name.
 */
export type ColorInfo = { key: string; english: string; spanish: string; hex: string; text: string };

export const KNOWN_COLORS: ColorInfo[] = [
  { key: "red", english: "Red", spanish: "Rojo", hex: "#dc2626", text: "#fff" },
  { key: "orange", english: "Orange", spanish: "Naranja", hex: "#f97316", text: "#111" },
  { key: "yellow", english: "Yellow", spanish: "Amarillo", hex: "#facc15", text: "#111" },
  { key: "green", english: "Green", spanish: "Verde", hex: "#16a34a", text: "#fff" },
  { key: "blue", english: "Blue", spanish: "Azul", hex: "#2563eb", text: "#fff" },
  { key: "purple", english: "Purple", spanish: "Morado", hex: "#7c3aed", text: "#fff" },
  { key: "pink", english: "Pink", spanish: "Rosa", hex: "#ec4899", text: "#fff" },
  { key: "brown", english: "Brown", spanish: "Café", hex: "#92400e", text: "#fff" },
  { key: "black", english: "Black", spanish: "Negro", hex: "#111827", text: "#fff" },
  { key: "white", english: "White", spanish: "Blanco", hex: "#f9fafb", text: "#111" },
  { key: "gray", english: "Gray", spanish: "Gris", hex: "#6b7280", text: "#fff" },
  { key: "silver", english: "Silver", spanish: "Plata", hex: "#c0c0c0", text: "#111" },
  { key: "gold", english: "Gold", spanish: "Oro", hex: "#d4af37", text: "#111" },
  { key: "tan", english: "Tan", spanish: "Beige", hex: "#d2b48c", text: "#111" },
  { key: "teal", english: "Teal", spanish: "Verde azulado", hex: "#0d9488", text: "#fff" },
  { key: "navy", english: "Navy", spanish: "Azul marino", hex: "#1e3a8a", text: "#fff" },
  { key: "maroon", english: "Maroon", spanish: "Granate", hex: "#7f1d1d", text: "#fff" },
  { key: "lime", english: "Lime", spanish: "Lima", hex: "#84cc16", text: "#111" },
  { key: "turquoise", english: "Turquoise", spanish: "Turquesa", hex: "#06b6d4", text: "#111" },
  { key: "magenta", english: "Magenta", spanish: "Magenta", hex: "#d946ef", text: "#fff" },
  { key: "peach", english: "Peach", spanish: "Durazno", hex: "#fdba74", text: "#111" },
  { key: "lavender", english: "Lavender", spanish: "Lavanda", hex: "#c4b5fd", text: "#111" },
  { key: "aqua", english: "Aqua", spanish: "Aguamarina", hex: "#67e8f9", text: "#111" },
  { key: "violet", english: "Violet", spanish: "Violeta", hex: "#8b5cf6", text: "#fff" },
  { key: "indigo", english: "Indigo", spanish: "Índigo", hex: "#4f46e5", text: "#fff" },
  { key: "olive", english: "Olive", spanish: "Oliva", hex: "#6b7f1a", text: "#fff" },
  { key: "coral", english: "Coral", spanish: "Coral", hex: "#fb7185", text: "#111" },
  { key: "burgundy", english: "Burgundy", spanish: "Borgoña", hex: "#6d1a2e", text: "#fff" },
  { key: "cream", english: "Cream", spanish: "Crema", hex: "#fef3c7", text: "#111" },
  { key: "copper", english: "Copper", spanish: "Cobre", hex: "#b87333", text: "#fff" },
];

/**
 * Other spellings the hotline might use for a color people chose under its
 * usual name. Matching is by exact key, so without this "grey" on the page
 * would not alert someone who picked "Gray".
 */
const ALIASES: Record<string, string> = { grey: "gray", "light grey": "light gray", "dark grey": "dark gray" };

/** Normalize a color key: lowercase, trimmed, letters/spaces only, one spelling per color. */
export function normalizeColorKey(raw: string): string {
  const key = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s-]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  return ALIASES[key] ?? key;
}

/**
 * True when the hotline calls everyone in ("all colors", "all", "todos") rather
 * than naming colors. On such a day every subscriber's colors count as listed.
 */
export function everyoneCalled(todayKeys: Iterable<string>): boolean {
  for (const k of todayKeys) if (/^(all|all colou?rs|every colou?r|todos|todos los colores)$/.test(k)) return true;
  return false;
}

/** Which of a person's colors are called today. */
export function matchedColors(mine: string[], todayKeys: Iterable<string>): string[] {
  const today = new Set(todayKeys);
  return everyoneCalled(today) ? [...mine] : mine.filter((c) => today.has(c));
}

/** Black or white, whichever reads better on the given background. */
const NAMED: Record<string, string> = {
  red: "#ff0000", orange: "#ffa500", yellow: "#ffff00", green: "#008000", blue: "#0000ff", purple: "#800080", pink: "#ffc0cb",
  brown: "#a52a2a", black: "#000000", white: "#ffffff", gray: "#808080", grey: "#808080", teal: "#008080", navy: "#000080",
  maroon: "#800000", olive: "#808000", lime: "#00ff00", aqua: "#00ffff", cyan: "#00ffff", magenta: "#ff00ff", silver: "#c0c0c0",
  gold: "#ffd700", tan: "#d2b48c", turquoise: "#40e0d0", violet: "#ee82ee", indigo: "#4b0082", coral: "#ff7f50", salmon: "#fa8072",
  lavender: "#e6e6fa", chartreuse: "#7fff00", beige: "#f5f5dc", ivory: "#fffff0", khaki: "#f0e68c", crimson: "#dc143c", orchid: "#da70d6", plum: "#dda0dd",
};

export function textOn(color: string): string {
  const hex = NAMED[color.trim().toLowerCase()] ?? color;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#111";
  const n = parseInt(m[1], 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#111" : "#fff";
}

/**
 * Colors the hotline has used that aren't in the built-in list above, learned
 * from the page itself (name, Spanish name, the page's own background). Filled
 * on the server from DynamoDB (see seen-colors.ts); client components pass the
 * day's color object as a hint instead.
 */
const seen = new Map<string, ColorInfo>();
export function registerColors(list: ColorInfo[]) {
  for (const c of list) if (!KNOWN_COLORS.some((k) => k.key === c.key)) seen.set(c.key, c);
}

export type ColorHint = { english?: string; spanish?: string; siteBackground?: string | null };

export function colorInfo(key: string, hint?: ColorHint): ColorInfo {
  const k = normalizeColorKey(key);
  const known = KNOWN_COLORS.find((c) => c.key === k);
  if (known) return known;
  const learned = seen.get(k);
  const hex = hint?.siteBackground || learned?.hex || "#9ca3af";
  return {
    key: k,
    english: hint?.english || learned?.english || k.charAt(0).toUpperCase() + k.slice(1),
    spanish: hint?.spanish || learned?.spanish || "",
    hex,
    text: textOn(hex),
  };
}
