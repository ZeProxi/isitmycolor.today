"use client";

import { createContext, useContext, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LANG_COOKIE, t, type Lang } from "@/lib/i18n";

const Ctx = createContext<Lang>("en");

function writeLangCookie(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

export function useLang() {
  const lang = useContext(Ctx);
  return { lang, s: t(lang) };
}

/** EN / ES switch. Stores the choice in a cookie, re-renders the server tree, and moves a signed-in person's alerts to that language. */
export function LangToggle() {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();

  function set(next: Lang) {
    if (next === lang) return;
    writeLangCookie(next);
    // Someone with an alert gets it in the language they read the site in. Signed-out visitors get a
    // 401 here, which is fine: there is nothing to update.
    fetch("/api/me/lang", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang: next }), keepalive: true }).catch(() => {});
    start(() => router.refresh());
  }

  return (
    <div
      role="group"
      aria-label="Language"
      className={`flex overflow-hidden rounded border border-line-strong text-xs font-semibold ${pending ? "opacity-60" : ""}`}
    >
      {(["en", "es"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => set(l)}
          aria-pressed={lang === l}
          className={`px-2 py-1 uppercase ${lang === l ? "bg-fg text-ink" : "text-fg-muted hover:text-fg"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
