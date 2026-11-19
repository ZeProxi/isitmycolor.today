"use client";

import { useEffect, useState } from "react";
import { useLang } from "./LangProvider";
import { colorInfo } from "@/lib/colors";
import type { AlertEntry, ChannelStatus } from "@/lib/alertlog";

/** What we sent this person and when. Only renders inside the signed-in card. */
export function AlertHistory({ refreshKey = 0 }: { refreshKey?: number }) {
  const { s, lang } = useLang();
  const [rows, setRows] = useState<AlertEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState(false);

  // First page: when the section is opened, and again after a test send.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/me/alerts")
      .then((r) => (r.ok ? r.json() : { alerts: [], more: false }))
      .then((d) => {
        if (!alive) return;
        setRows(d.alerts ?? []);
        setMore(!!d.more);
      })
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [open, refreshKey]);

  /** Ten more, older than the last one on screen. */
  async function older() {
    if (!rows?.length) return;
    setLoadingMore(true);
    try {
      const r = await fetch(`/api/me/alerts?before=${encodeURIComponent(rows[rows.length - 1].at)}`);
      const d = r.ok ? await r.json() : { alerts: [], more: false };
      setRows([...rows, ...(d.alerts ?? [])]);
      setMore(!!d.more);
    } catch {
      // leave the list as it is; the button stays so they can try again
    } finally {
      setLoadingMore(false);
    }
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === "es" ? "es-US" : "en-US", {
      timeZone: "America/Denver",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  const chip = (label: string, st?: ChannelStatus) => {
    if (!st) return null;
    const tone = st === "sent" ? "text-ok" : st === "failed" ? "text-danger" : "text-fg-faint";
    return (
      <span key={label} className={`inline-flex items-center gap-1 ${tone}`}>
        <span aria-hidden>{st === "sent" ? "✓" : st === "failed" ? "✕" : "·"}</span>
        {label}
        {st === "stopped" ? ` (${s.alertLog.stopped})` : ""}
      </span>
    );
  };

  return (
    <details className="mt-4 rounded-md border border-white/10" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">{s.alertLog.title}</summary>
      <div className="px-4 pb-4">
        {rows === null ? (
          <p className="text-sm text-fg-faint">{s.alertLog.loading}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-fg-muted">{s.alertLog.empty}</p>
        ) : (
          <ul className="divide-y divide-white/10 text-sm">
            {rows.map((r) => (
              <li key={r.at} className="py-2.5">
                {/* two lines, so nothing has to squeeze on a phone: what and when, then how it went */}
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">
                    {r.kind === "test" ? s.alertLog.test : r.kind === "notice" ? s.alertLog.notice : r.kind === "ending" ? s.alertLog.ending : r.colors.length ? r.colors.map((k) => colorInfo(k)[lang === "es" ? "spanish" : "english"]).join(", ") : s.alertLog.notYours}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-fg-muted">{fmt(r.at)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                  {chip(s.alertLog.sms, r.sms)}
                  {chip(s.alertLog.email, r.email)}
                  {chip(s.alertLog.push, r.push)}
                </div>
              </li>
            ))}
          </ul>
        )}
        {more && (
          <button type="button" className="btn-ghost mt-3 w-full py-2 text-sm" onClick={older} disabled={loadingMore}>
            {loadingMore ? s.alertLog.loadingMore : s.alertLog.older}
          </button>
        )}
        <p className="mt-2 text-xs text-fg-faint">{s.alertLog.help}</p>
      </div>
    </details>
  );
}
