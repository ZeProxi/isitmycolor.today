"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useLang } from "./LangProvider";
import { useAnalyticsTab } from "./HiddenShortcuts";

const TABS = [
  { href: "/", key: "today", icon: SunIcon },
  { href: "/notify", key: "alerts", icon: BellIcon },
  { href: "/history", key: "history", icon: CalendarIcon },
  { href: "/official", key: "official", icon: LinkIcon },
  { href: "/resources", key: "resources", icon: HeartIcon },
  { href: "/about", key: "about", icon: InfoIcon },
] as const;

/** Revealed with Ctrl+Alt+V; see HiddenShortcuts. */
const ANALYTICS = { href: "/analytics", key: "analytics", icon: ChartIcon } as const;

export function NavTabs({ placement }: { placement: "top" | "bottom" }) {
  const pathname = usePathname();
  const { s } = useLang();
  const showAnalytics = useAnalyticsTab();
  const tabs = showAnalytics ? [...TABS, ANALYTICS] : [...TABS];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  if (placement === "bottom") return <PhoneBar pathname={pathname} menu={tabs.filter((t) => !PHONE_BAR.some((k) => k === t.key))} />;

  return (
    <nav aria-label="Primary" className="hidden items-center gap-5 md:flex">
      {tabs.map(({ href, key }) => {
        const on = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`py-1 text-sm underline-offset-[6px] ${
              on ? "font-semibold text-fg underline decoration-accent decoration-2" : "text-fg-muted hover:text-fg"
            }`}
          >
            {s.nav[key]}
          </Link>
        );
      })}
    </nav>
  );
}

/** What sits on the phone's bottom bar itself; everything else is one tap away under Menu. */
const PHONE_BAR = ["today", "alerts"] as const;

type Tab = { href: string; key: "today" | "alerts" | "history" | "official" | "resources" | "about" | "analytics"; icon: (p: { className?: string }) => React.ReactNode };

/**
 * Phones: Today, Alerts and Menu. Menu opens a sheet above the bar with the
 * rest of the pages, and closes on a choice, a tap outside, or Escape.
 */
function PhoneBar({ pathname, menu }: { pathname: string; menu: readonly Tab[] }) {
  const { s } = useLang();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const inMenu = menu.some((t) => isActive(t.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const item = (on: boolean) =>
    `flex flex-col items-center gap-0.5 border-t-2 py-2 text-[11px] ${on ? "border-accent font-semibold text-fg" : "border-transparent font-medium text-fg-muted"}`;

  return (
    <div className="md:hidden">
      {open && <button type="button" aria-label={s.nav.closeMenu} className="fixed inset-0 z-40 bg-black/60" onClick={() => setOpen(false)} />}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ink" style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}>
        {open && (
          <ul id="phone-menu" className="absolute inset-x-0 bottom-full border-t border-line bg-ink-2 px-2 py-2">
            {menu.map(({ href, key, icon: Icon }) => {
              const on = isActive(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={on ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-md px-3 py-3.5 text-base ${on ? "bg-white/10 font-semibold text-fg" : "font-medium text-fg"}`}
                  >
                    <Icon className="h-5 w-5 text-fg-muted" />
                    {s.nav[key]}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <div className="grid grid-cols-3 px-1 pt-1">
          {TABS.filter((t) => PHONE_BAR.some((k) => k === t.key)).map(({ href, key, icon: Icon }) => {
            const on = isActive(href) && !open;
            return (
              <Link key={href} href={href} aria-current={on ? "page" : undefined} onClick={() => setOpen(false)} className={item(on)}>
                <Icon className="h-5 w-5" />
                {s.nav[key]}
              </Link>
            );
          })}
          <button type="button" aria-expanded={open} aria-controls="phone-menu" onClick={() => setOpen((v) => !v)} className={item(open || inMenu)}>
            <MenuIcon className="h-5 w-5" />
            {s.nav.menu}
          </button>
        </div>
      </nav>
    </div>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
    </svg>
  );
}
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}
function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}
function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}
function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  );
}
function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 20h16M7 16v-5M12 16V7M17 16v-9" />
    </svg>
  );
}
function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </svg>
  );
}
