"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang } from "./LangProvider";
import { useAnalyticsTab } from "./HiddenShortcuts";

const TABS = [
  { href: "/", key: "today", icon: SunIcon },
  { href: "/history", key: "history", icon: CalendarIcon },
  { href: "/notify", key: "alerts", icon: BellIcon },
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
  // the phone bar has room for five: About lives in the footer there
  const phoneTabs = tabs.filter((t) => t.key !== "about");
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  if (placement === "bottom") {
    return (
      <nav
        aria-label="Primary"
        className="tabbar fixed inset-x-3 bottom-3 z-40 grid rounded-2xl p-1 md:hidden"
        style={{ gridTemplateColumns: `repeat(${phoneTabs.length}, 1fr)`, paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
      >
        {phoneTabs.map(({ href, key, icon: Icon }) => {
          const on = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-semibold transition ${
                on ? "bg-white text-ink" : "text-fg hover:bg-white/10"
              }`}
            >
              <Icon className="h-5 w-5" />
              {s.nav[key]}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Primary" className="glass hidden items-center gap-1 rounded-full p-1 md:flex">
      {tabs.map(({ href, key }) => {
        const on = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              on ? "bg-white text-ink shadow-[inset_0_1px_0_#fff]" : "text-fg-muted hover:bg-white/8 hover:text-fg"
            }`}
          >
            {s.nav[key]}
          </Link>
        );
      })}
    </nav>
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
