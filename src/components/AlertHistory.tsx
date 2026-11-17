"use client";

import { useEffect, useState } from "react";
import { useLang } from "./LangProvider";
import { colorInfo } from "@/lib/colors";
import type { AlertEntry, ChannelStatus } from "@/lib/alertlog";

/** What we sent this person and when. Only renders inside the signed-in card. */
export function AlertHistory({ refreshKey = 0 }: { refreshKey?: number }) {
  const { s, lang } = useLang();
  const [rows, setRows] = useState<AlertEntry[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/me/alerts")
      .then((r) => (r.ok ? r.json() : { alerts: [] }))
      .then((d) => alive && setRows(d.alerts ?? []))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [open, refreshKey]);

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
              <li key={r.at} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                <span className="tabular-nums text-fg-muted">{fmt(r.at)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {r.kind === "test" ? s.alertLog.test : r.colors.length ? r.colors.map((k) => colorInfo(k)[lang === "es" ? "spanish" : "english"]).join(", ") : s.alertLog.notYours}
                </span>
                <span className="flex gap-3 text-xs">
                  {chip(s.alertLog.sms, r.sms)}
                  {chip(s.alertLog.email, r.email)}
                  {chip(s.alertLog.push, r.push)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-fg-faint">{s.alertLog.help}</p>
      </div>
    </details>
  );
}
