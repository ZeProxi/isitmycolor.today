"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const KEY = "analyticsTab";
const EVENT = "analytics-tab-change";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function write(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable; the tab just won't persist
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Whether the hidden Analytics tab is revealed in this browser. */
export function useAnalyticsTab(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

/** Ctrl+Alt+V toggles the Analytics tab and opens it. Renders nothing. */
export function HiddenShortcuts() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        const next = !read();
        write(next);
        if (next) router.push("/analytics");
        else if (location.pathname.startsWith("/analytics")) router.push("/");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
