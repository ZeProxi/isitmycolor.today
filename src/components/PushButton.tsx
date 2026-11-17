"use client";

import { useEffect, useState } from "react";
import { useLang } from "./LangProvider";

type State = "unavailable" | "checking" | "unsupported" | "needs-install" | "off" | "on" | "denied" | "busy";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * "Notify this phone" for the signed-in person. Uses the browser's push API:
 * free, no carrier involved. On iPhone it only works after the site is added to
 * the home screen, so we say that instead of showing a button that can't work.
 */
export function PushButton({ className = "rounded-md bg-white/5 px-3 py-2.5 ring-1 ring-white/10", title, help }: { className?: string; title?: string; help?: string } = {}) {
  const { s } = useLang();
  const [state, setState] = useState<State>("checking");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const standalone = (navigator as { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;
        return setState(isIOS && !standalone ? "needs-install" : "unsupported");
      }
      // No push keys on this server (a local dev setup, usually): show the card, but say so instead of offering a button that can only fail.
      if (!(await fetch("/api/push/key")).ok) return setState("unavailable");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  // "Notifications are on for this device." is a result, not a label: it goes after a few seconds.
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(""), msg === s.push.failed ? 7000 : 3500);
    return () => clearTimeout(id);
  }, [msg, s.push.failed]);

  async function enable() {
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState("denied");
      const { key } = await fetch("/api/push/key").then((r) => r.json());
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      if (!r.ok) throw new Error("save failed");
      setMsg(s.push.enabled);
      setState("on");
    } catch {
      setMsg(s.push.failed);
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setMsg(s.push.disabled);
      setState("off");
    } catch {
      setMsg(s.push.failed);
      setState("on");
    }
  }

  if (state === "checking") return null;

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-semibold">{title ?? s.push.title}</span>
          <span className="block text-xs text-fg-muted">
            {state === "needs-install" ? s.push.needsInstall : state === "unavailable" ? s.push.unavailable : state === "unsupported" ? s.push.unsupported : state === "denied" ? s.push.denied : (help ?? s.push.help)}
          </span>
        </span>
        {(state === "off" || state === "on" || state === "busy") && (
          <button
            type="button"
            onClick={state === "on" ? disable : enable}
            disabled={state === "busy"}
            className={state === "on" ? "btn-ghost shrink-0 px-3 py-1.5 text-sm" : "btn-primary shrink-0 px-3 py-1.5 text-sm"}
          >
            {state === "busy" ? "…" : state === "on" ? s.push.turnOff : s.push.turnOn}
          </button>
        )}
      </div>
      {msg && <p className={`mt-2 text-xs ${msg === s.push.failed ? "text-danger" : "text-ok"}`} role="status">{msg}</p>}
    </div>
  );
}
