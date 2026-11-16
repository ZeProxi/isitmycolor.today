"use client";

import { useEffect, useState } from "react";
import { useLang } from "./LangProvider";

type State = "checking" | "unsupported" | "needs-install" | "off" | "on" | "denied" | "busy";

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
export function PushButton() {
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
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

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
    <div className="rounded-2xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-semibold">{s.push.title}</span>
          <span className="block text-xs text-fg-muted">
            {state === "needs-install" ? s.push.needsInstall : state === "unsupported" ? s.push.unsupported : state === "denied" ? s.push.denied : s.push.help}
          </span>
        </span>
        {(state === "off" || state === "on" || state === "busy") && (
          <button
            type="button"
            onClick={state === "on" ? disable : enable}
            disabled={state === "busy"}
            className={state === "on" ? "btn-ghost shrink-0 text-sm" : "btn-primary shrink-0 text-sm"}
          >
            {state === "busy" ? "…" : state === "on" ? s.push.turnOff : s.push.turnOn}
          </button>
        )}
      </div>
      {msg && <p className="mt-2 text-xs text-ok">{msg}</p>}
    </div>
  );
}
