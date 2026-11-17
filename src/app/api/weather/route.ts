/**
 * GET /api/weather -> what the sky is doing in Utah Valley right now, for the mountains in the footer.
 *
 * Read from the National Weather Service's station at Provo Airport (free, no key). Our server asks, not
 * the visitor's browser, so nothing about the visitor reaches the weather service, and the answer is kept
 * for fifteen minutes so we ask at most a few times an hour however many people are on the site.
 * If the weather can't be read, the answer is "clear": the footer simply looks the way it always has.
 */
type Kind = "clear" | "partly" | "cloudy" | "fog" | "rain" | "snow" | "storm";
type Weather = { kind: Kind; heavy: boolean; day: boolean };

const STATION = "https://api.weather.gov/stations/KPVU/observations/latest";
const KEEP_MS = 15 * 60 * 1000;
const CLEAR: Weather = { kind: "clear", heavy: false, day: true };
let cached: { at: number; value: Weather } | null = null;

/** Turn the station's plain description ("Light Rain", "Mostly Cloudy", "Thunderstorm and Snow"…) into one of our kinds. */
function classify(description: string, icon: string): Weather {
  const d = description.toLowerCase();
  const day = !icon.includes("/night/");
  const heavy = /heavy|thunder/.test(d);
  let kind: Kind = "clear";
  if (/thunder|lightning/.test(d)) kind = "storm";
  else if (/snow|sleet|ice|flurr|blizzard|wintry/.test(d)) kind = "snow";
  else if (/rain|drizzle|shower|hail/.test(d)) kind = "rain";
  else if (/fog|mist|haze|smoke/.test(d)) kind = "fog";
  else if (/overcast|mostly cloudy|^cloudy/.test(d)) kind = "cloudy";
  else if (/cloud/.test(d)) kind = "partly";
  return { kind, heavy, day };
}

export async function GET() {
  const headers = { "cache-control": "public, max-age=600, s-maxage=900" };
  if (cached && Date.now() - cached.at < KEEP_MS) return Response.json(cached.value, { headers });
  try {
    const r = await fetch(STATION, {
      headers: { "user-agent": "weather-footer/1.0", accept: "application/geo+json" },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`station answered ${r.status}`);
    const p = (await r.json())?.properties ?? {};
    const value = classify(String(p.textDescription ?? ""), String(p.icon ?? ""));
    cached = { at: Date.now(), value };
    return Response.json(value, { headers });
  } catch (e) {
    console.warn("weather unavailable", e);
    // keep showing the last thing we knew if we have it; otherwise a clear sky. Try again in a minute.
    return Response.json(cached?.value ?? CLEAR, { headers: { "cache-control": "public, max-age=60" } });
  }
}
