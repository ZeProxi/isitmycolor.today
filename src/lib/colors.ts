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

/** Normalize a color key: lowercase, trimmed, letters/spaces only. */
export function normalizeColorKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s-]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function colorInfo(key: string): ColorInfo {
  const k = normalizeColorKey(key);
  return (
    KNOWN_COLORS.find((c) => c.key === k) ?? {
      key: k,
      english: k.charAt(0).toUpperCase() + k.slice(1),
      spanish: "",
      hex: "#9ca3af",
      text: "#111",
    }
  );
}
