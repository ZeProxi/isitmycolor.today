"use client";

import { useState } from "react";
import { useLang } from "./LangProvider";

type View = "ask" | "code" | "on" | "removed" | "notyet";
type Reply = { state?: View | "inactive"; phone?: string; devCode?: string; error?: string };

/**
 * A support person adding (or removing) their own number for texts. They type it and prove it with a
 * code; the person they support never supplies it and never sees it. Each step posts to
 * /api/supporter/text, which answers with the next screen to show.
 */
export function SupporterText({ action, who, initial, phone: startPhone }: { action: string; who: string; initial: "ask" | "on" | "notyet"; phone: string }) {
  const { s: all } = useLang();
  const s = all.supporterPages;
  const [view, setView] = useState<View | "inactive">(initial);
  const [phone, setPhone] = useState(startPhone); // shown back to them, formatted
  const [raw, setRaw] = useState(""); // as typed, sent with the code
  const [devCode, setDevCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(fields: Record<string, string>) {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      for (const [k, v] of Object.entries(fields)) body.set(k, v);
      const r = await fetch(action, { method: "POST", body, headers: { accept: "application/json" } });
      const d = (await r.json().catch(() => ({}))) as Reply;
      if (d.error) setError((s.errors as Record<string, string>)[d.error] ?? s.errors.network);
      if (d.state) setView(d.state);
      if (d.phone) setPhone(d.phone);
      setDevCode(d.devCode ?? "");
    } catch {
      setError(s.errors.network);
    } finally {
      setBusy(false);
    }
  }

  const title = "max-w-2xl text-4xl font-bold sm:text-5xl";
  const body = "mt-3 max-w-prose text-fg-muted";
  const err = error ? (
    <p className="mt-4 text-sm text-danger" role="alert">
      {error}
    </p>
  ) : null;

  if (view === "inactive") {
    return (
      <article className="pt-10 sm:pt-16">
        <h1 className={title}>{s.inactiveTitle}</h1>
        <p className={body}>{s.inactiveBody}</p>
      </article>
    );
  }
  if (view === "notyet") {
    return (
      <article className="pt-10 sm:pt-16">
        <h1 className={title}>{s.notYetTitle}</h1>
        <p className={body}>{s.notYetBody}</p>
      </article>
    );
  }
  if (view === "removed") {
    return (
      <article className="pt-10 sm:pt-16">
        <h1 className={title}>{s.removedTitle}</h1>
        <p className={body}>{s.removedBody}</p>
      </article>
    );
  }
  if (view === "on") {
    return (
      <article className="pt-10 sm:pt-16">
        <h1 className={title}>{s.onTitle}</h1>
        <p className={body}>{s.onBody(who, phone)}</p>
        {err}
        <button type="button" className="link mt-6 text-sm" disabled={busy} onClick={() => post({ step: "remove" })}>
          {busy ? s.working : s.removeText}
        </button>
      </article>
    );
  }
  if (view === "code") {
    return (
      <article className="pt-10 sm:pt-16">
        <h1 className={title}>{s.codeTitle}</h1>
        <p className={body}>{s.codeSent(phone)}</p>
        {devCode && <p className="mt-2 text-sm text-fg-muted">{s.dev(devCode)}</p>}
        <form
          className="mt-6 max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void post({ step: "verify", phone: raw, code: String(new FormData(e.currentTarget).get("code") ?? "") });
          }}
        >
          <label htmlFor="sup-code" className="block text-sm font-semibold">
            {s.codeLabel}
          </label>
          <input id="sup-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required autoFocus className="field mt-2 text-xl tracking-[0.3em]" />
          {err}
          <button type="submit" disabled={busy} className="btn-primary mt-5 w-full">
            {busy ? s.working : s.turnOn}
          </button>
        </form>
        <button type="button" className="link mt-4 text-sm" disabled={busy} onClick={() => { setError(""); setView("ask"); }}>
          {s.otherNumber}
        </button>
      </article>
    );
  }
  return (
    <article className="pt-10 sm:pt-16">
      <h1 className={title}>{s.textTitle(who)}</h1>
      <p className={body}>{s.textBody}</p>
      <form
        className="mt-6 max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const typed = String(f.get("phone") ?? "");
          setRaw(typed);
          void post({ step: "send", phone: typed, consent: f.get("consent") ? "yes" : "", unaffiliated: f.get("unaffiliated") ? "yes" : "" });
        }}
      >
        <label htmlFor="sup-phone" className="block text-sm font-semibold">
          {s.phoneLabel}
        </label>
        <input id="sup-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(801) 555-1234" required defaultValue={raw} className="field mt-2 text-xl" />
        {/* Consent is given by ticking these, never assumed: both start unticked and both are required. */}
        <label className="mt-5 flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="consent" value="yes" required className="mt-0.5 h-5 w-5 shrink-0 accent-[#edb058]" />
          <span className="text-sm font-semibold">{s.agreeTexts(who)}</span>
        </label>
        <label className="mt-3 flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="unaffiliated" value="yes" required className="mt-0.5 h-5 w-5 shrink-0 accent-[#edb058]" />
          <span className="text-sm font-semibold">{s.notAffiliated}</span>
        </label>
        {err}
        <button type="submit" disabled={busy} className="btn-primary mt-6 w-full">
          {busy ? s.working : s.sendCode}
        </button>
      </form>
      <p className="mt-4 text-sm text-fg-muted">{s.usOnly}</p>
    </article>
  );
}
