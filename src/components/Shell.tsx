import Link from "next/link";
import { connection } from "next/server";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { LangProvider, LangToggle } from "./LangProvider";
import { NavTabs } from "./NavTabs";
import { HiddenShortcuts } from "./HiddenShortcuts";
import { myColors } from "@/lib/mine";
import { env } from "@/lib/env";
import { ready } from "@/lib/config";
import { colorInfo } from "@/lib/colors";
import { withSeenColors } from "@/lib/seen-colors";

/** Request-time chrome: reads the language cookie and wraps the page in the header/footer/tab bar. */
export async function Shell({ children }: { children: React.ReactNode }) {
  await connection(); // the header shows the signed-in person's colors, so it renders per request
  const lang = await getLang();
  const s = t(lang);
  const mine = await myColors();
  await ready();
  await withSeenColors();
  const sunset = env.siteSunset;
  const notice = env.siteNotice;
  const brand =
    mine.length === 0
      ? s.brand
      : mine
          .map((k) => {
            const c = colorInfo(k);
            return lang === "es" && c.spanish ? c.spanish : c.english;
          })
          .join(" & ");

  return (
    <LangProvider lang={lang}>
      <HiddenShortcuts />
      {(sunset || notice) && (
        <div className={`relative z-30 px-4 py-2.5 text-center text-sm font-medium ${sunset ? "bg-danger text-ink" : "bg-amber-300 text-ink"}`}>
          {sunset ? s.banner.sunset : notice}{" "}
          {sunset && (
            <a className="font-bold underline" href="https://wasatch.org/colors/">
              {s.banner.official}
            </a>
          )}
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink/55 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="display flex items-center gap-2.5 text-lg font-bold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.svg" alt="" width={28} height={28} className="h-7 w-7 rounded-lg" />
            {brand}
            {mine.length > 0 && (
              <span className="inline-flex translate-y-[-1px] items-center" title={mine.map((k) => colorInfo(k).english).join(", ")}>
                {mine.slice(0, 3).map((k, i) => {
                  const c = colorInfo(k);
                  return (
                    <span
                      key={k}
                      className="inline-block h-3 w-3 rounded-full ring-2 ring-ink"
                      style={{ background: c.hex, boxShadow: `0 0 12px ${c.hex}`, marginLeft: i ? -5 : 0 }}
                    />
                  );
                })}
              </span>
            )}
          </Link>
          <NavTabs placement="top" />
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/ZeProxi/isitmycolor.today"
              target="_blank"
              rel="noreferrer"
              aria-label={s.footer.source}
              title={s.footer.source}
              className="glass hidden h-8 w-8 items-center justify-center rounded-full text-fg-muted transition hover:text-fg sm:inline-flex"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </a>
            <LangToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-2 sm:px-6 md:pb-16">{children}</main>

      <footer className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 sm:px-6 md:pb-10">
        <div className="border-t border-white/10 pt-6 text-sm">
          <p className="font-semibold text-fg">{s.footer.lead}</p>
          <p className="mt-1 max-w-prose text-fg-muted">{s.footer.body}</p>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-fg-muted">
            <li>
              <a className="underline decoration-fg-faint underline-offset-4 hover:text-fg" href="https://wasatch.org/colors/" target="_blank" rel="noreferrer">
                {s.footer.official}: wasatch.org/colors
              </a>
            </li>
            <li>
              <a className="underline decoration-fg-faint underline-offset-4 hover:text-fg" href="tel:+13852685002">
                {s.footer.hotline}: (385) 268-5002
              </a>
            </li>
            <li>
              <a className="underline decoration-fg-faint underline-offset-4 hover:text-fg" href="https://github.com/ZeProxi/isitmycolor.today" target="_blank" rel="noreferrer">
                {s.footer.source}
              </a>
            </li>
            <li>
              <Link className="underline decoration-fg-faint underline-offset-4 hover:text-fg" href="/about">
                {s.footer.about}
              </Link>
            </li>
            <li>
              <Link className="underline decoration-fg-faint underline-offset-4 hover:text-fg" href="/privacy">
                {s.footer.privacy}
              </Link>
            </li>
            <li>
              <Link className="underline decoration-fg-faint underline-offset-4 hover:text-fg" href="/terms">
                {s.footer.terms}
              </Link>
            </li>
            <li>
              <Link className="underline decoration-fg-faint underline-offset-4 hover:text-fg" href="/flyer">
                {s.footer.flyer}
              </Link>
            </li>
          </ul>
        </div>
      </footer>

      <div aria-hidden className="tabbar-fade pointer-events-none fixed inset-x-0 bottom-0 z-30 h-28 md:hidden" />
      <NavTabs placement="bottom" />
    </LangProvider>
  );
}
