import { getTodayColors } from "@/lib/today";
import { colorInfo } from "@/lib/colors";

/**
 * Soft color blooms behind the whole page, tinted with today's actual colors.
 * Falls back to a cool neutral glow if the page can't be read.
 */
export async function Ambient() {
  const data = await getTodayColors();
  const hexes =
    "error" in data || data.colors.length === 0
      ? ["#3b5bdb", "#5f3dc4"]
      : data.colors.map((c) => c.siteBackground ?? colorInfo(c.key).hex);
  return <AmbientLayer hexes={hexes} />;
}

export function AmbientLayer({ hexes }: { hexes: string[] }) {
  const [a, b = a, c = b] = hexes;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="bloom"
        style={{ left: "-10vw", top: "-12vh", width: "55vw", height: "55vw", background: a }}
      />
      <div
        className="bloom"
        style={{ right: "-14vw", top: "8vh", width: "50vw", height: "50vw", background: b }}
      />
      <div
        className="bloom"
        style={{ left: "25vw", bottom: "-28vh", width: "48vw", height: "48vw", background: c, opacity: 0.35 }}
      />
      {/* fine grain so the blur doesn't band */}
      <div
        className="absolute inset-0 opacity-[0.07] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.8'/></svg>\")",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-ink/40 to-ink" />
    </div>
  );
}
