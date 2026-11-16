"use client";

import { useEffect, useRef, useState } from "react";
import type { ColorInfo } from "@/lib/colors";
import { useLang } from "./LangProvider";
import { PushButton } from "./PushButton";

type Prefs = { mode: "match" | "daily"; includeOfficial: boolean; earliestHour: number };
const DEFAULT_PREFS: Prefs = { mode: "match", includeOfficial: false, earliestHour: 6 };
type Subscriber = {
  phone: string;
  colors: string[];
  lang?: string;
  email?: string;
  prefs?: Prefs;
  agreedAt?: string;
  agreementVersion?: number;
  lastNotifiedDate?: string;
};
type Step = "loading" | "phone" | "code" | "colors" | "email" | "agree" | "done";
const AGREEMENT_VERSION = 1;
const hasAgreed = (sub: Subscriber | null) => !!sub?.agreedAt && (sub.agreementVersion ?? 0) >= AGREEMENT_VERSION;
type Status = { kind: "idle" | "busy" | "ok" | "err"; msg?: string };

const STEP_INDEX: Record<Exclude<Step, "loading" | "done">, number> = { phone: 0, code: 1, colors: 2, email: 3, agree: 4 };

/**
 * One question per screen:
 *   phone -> code -> colors -> email (optional) -> done
 * Returning people with an alert land on "done" and edit from there.
 */
export function AlertsFlow({ smsPending = false }: { smsPending?: boolean }) {
  const { lang, s } = useLang();
  const [step, setStep] = useState<Step>("loading");
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [known, setKnown] = useState<ColorInfo[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [agreed, setAgreed] = useState(false);
  const [existing, setExisting] = useState<Subscriber | null>(null);
  const [editing, setEditing] = useState(false); // came from "done" to tweak one thing
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const verifying = useRef(false);

  // Already signed in? Skip the sign-in steps.
  useEffect(() => {
    fetch("/api/me")
      .then(async (r) => {
        if (r.status === 401) return setStep("phone");
        const d = await r.json();
        setSentTo(d.phone);
        loadSubscriber(d.subscriber);
        setStep(!d.subscriber ? "colors" : hasAgreed(d.subscriber) ? "done" : "agree");
      })
      .catch(() => setStep("phone"));
    fetch("/api/known-colors")
      .then((r) => r.json())
      .then((d) => setKnown(d.colors ?? []))
      .catch(() => {});
  }, []);

  // Auto-verify as soon as 6 digits are in.
  useEffect(() => {
    if (step === "code" && code.length === 6 && !verifying.current) void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step]);

  function loadSubscriber(sub: Subscriber | null) {
    setExisting(sub);
    setSelected(sub?.colors ?? []);
    setEmail(sub?.email ?? "");
    setPrefs(sub?.prefs ?? DEFAULT_PREFS);
  }

  /** Settings on the summary card save as soon as they change. */
  async function savePrefs(next: Prefs) {
    const prev = prefs;
    setPrefs(next);
    setStatus({ kind: "busy", msg: s.prefs.saving });
    try {
      const { r, d } = await call("/api/me", "PUT", { colors: selected, lang, email, prefs: next });
      if (r.status === 401) return signedOut();
      if (!r.ok) {
        setPrefs(prev);
        return setStatus({ kind: "err", msg: s.notify.saveFailed });
      }
      setExisting(d.subscriber);
      setStatus({ kind: "ok", msg: s.prefs.saved });
    } catch {
      setPrefs(prev);
      setStatus({ kind: "err", msg: s.notify.network });
    }
  }

  const busy = status.kind === "busy";

  async function call(url: string, method: string, body?: unknown) {
    const r = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { r, d: await r.json().catch(() => ({})) };
  }

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setStatus({ kind: "busy" });
    try {
      const { r, d } = await call("/api/auth/send-code", "POST", { phone });
      if (!r.ok) {
        const msg =
          d.error === "rate_limited" ? s.auth.tooMany
          : d.error === "sms_failed" ? s.auth.smsFailed
          : d.error === "invalid_phone" ? s.notify.phoneLabel
          : s.auth.wrongCode;
        return setStatus({ kind: "err", msg });
      }
      setSentTo(d.phone);
      setDevCode(d.devCode ?? null);
      setCode("");
      setStep("code");
      setStatus({ kind: "idle" });
    } catch {
      setStatus({ kind: "err", msg: s.notify.network });
    }
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (verifying.current) return;
    verifying.current = true;
    setStatus({ kind: "busy" });
    try {
      const { r, d } = await call("/api/auth/verify", "POST", { phone: sentTo, code });
      if (!r.ok) {
        const msg = d.error === "expired" ? s.auth.expired : d.error === "too_many" ? s.auth.tooMany : s.auth.wrongCode;
        setCode("");
        return setStatus({ kind: "err", msg });
      }
      loadSubscriber(d.subscriber);
      setDevCode(null);
      setStatus({ kind: "idle" });
      setStep(!d.subscriber ? "colors" : hasAgreed(d.subscriber) ? "done" : "agree");
    } catch {
      setStatus({ kind: "err", msg: s.notify.network });
    } finally {
      verifying.current = false;
    }
  }

  async function save(nextStep: Step, extra?: { email?: string; agree?: boolean }) {
    setStatus({ kind: "busy" });
    const colors = [...selected];
    try {
      const { r, d } = await call("/api/me", "PUT", { colors, lang, email: extra?.email ?? email, agree: extra?.agree === true });
      if (r.status === 401) return signedOut();
      if (!r.ok) {
        return setStatus({ kind: "err", msg: d.error === "invalid_email" ? s.notify.invalidEmail : s.notify.saveFailed });
      }
      loadSubscriber(d.subscriber);
      setEditing(false);
      setAgreed(false);
      setStatus(nextStep === "done" ? { kind: "ok", msg: s.wizard.saved } : { kind: "idle" });
      setStep(nextStep);
    } catch {
      setStatus({ kind: "err", msg: s.notify.network });
    }
  }

  async function sendTest() {
    setStatus({ kind: "busy", msg: s.prefs.testSending });
    try {
      const { r, d } = await call("/api/me/test", "POST");
      if (r.status === 401) return signedOut();
      if (!r.ok) {
        const msg = d.error === "limit" ? s.prefs.testLimit : s.prefs.testFailed;
        return setStatus({ kind: "err", msg });
      }
      const msg = d.dryRun ? s.prefs.testDry : d.sms === "sent" ? s.prefs.testSent(sentTo) : d.push === "sent" ? s.push.testSent : s.prefs.testEmailOnly(email || sentTo);
      setStatus({ kind: "ok", msg });
    } catch {
      setStatus({ kind: "err", msg: s.notify.network });
    }
  }

  async function remove() {
    setStatus({ kind: "busy" });
    try {
      const { r } = await call("/api/me", "DELETE");
      if (r.status === 401) return signedOut();
      if (!r.ok) return setStatus({ kind: "err", msg: s.notify.removeFailed });
      loadSubscriber(null);
      setStatus({ kind: "ok", msg: s.notify.stopped });
      setStep("colors");
    } catch {
      setStatus({ kind: "err", msg: s.notify.network });
    }
  }

  async function signOut() {
    await call("/api/auth/signout", "POST").catch(() => {});
    signedOut();
  }

  function signedOut() {
    loadSubscriber(null);
    setCode("");
    setPhone("");
    setEditing(false);
    setStep("phone");
    setStatus({ kind: "idle" });
  }

  function toggle(key: string) {
    setSelected((x) => (x.includes(key) ? x.filter((k) => k !== key) : [...x, key]));
  }

  const name = (c: ColorInfo) => (lang === "es" && c.spanish ? c.spanish : c.english);
  const statusLine = status.msg ? (
    <p className={`mt-3 text-sm ${status.kind === "err" ? "text-danger" : "text-ok"}`} role="status">
      {status.msg}
    </p>
  ) : null;

  if (step === "loading") return <div className="glass mx-auto h-72 max-w-lg animate-pulse rounded-3xl" />;

  // ---------- done: the summary card ----------
  if (step === "done") {
    const chosen = selected.map((k) => known.find((c) => c.key === k) ?? null);
    const names = chosen.map((c, i) => (c ? name(c) : selected[i])).join(" & ");
    const hourLabel = prefs.earliestHour === 12 ? "12 pm" : `${prefs.earliestHour} am`;
    const testing = status.kind === "busy" && status.msg === s.prefs.testSending;
    return (
      <div className="mx-auto max-w-lg">
        <section className="glass glass-strong rounded-3xl p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ok/15 text-ok ring-1 ring-ok/30">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h1 className="text-2xl font-bold">{names ? s.wizard.doneTitleFor(names) : s.wizard.doneTitle}</h1>
          </div>
          <p className="mt-3 text-sm text-fg-muted">
            {prefs.mode === "daily" ? s.wizard.summaryDaily(hourLabel) : s.wizard.summaryMatch(hourLabel)}
          </p>

          <dl className="mt-5 divide-y divide-white/10 text-sm">
            <Row label={s.wizard.number}>
              <span className="font-semibold tracking-wide">{sentTo}</span>
            </Row>
            <Row label={s.wizard.colors} action={<button type="button" className="link" onClick={() => { setEditing(true); setStep("colors"); setStatus({ kind: "idle" }); }}>{s.wizard.editColors}</button>}>
              <span className="flex flex-wrap gap-1.5">
                {chosen.map((c, i) =>
                  c ? (
                    <span key={c.key} className="gloss relative rounded-lg px-3 py-1 text-sm font-bold" style={{ background: c.hex, color: c.text }}>
                      <span className="relative">{name(c)}</span>
                    </span>
                  ) : (
                    <span key={selected[i]} className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold">{selected[i]}</span>
                  ),
                )}
              </span>
            </Row>
            <Row label={s.wizard.email} action={<button type="button" className="link" onClick={() => { setEditing(true); setStep("email"); setStatus({ kind: "idle" }); }}>{s.wizard.editEmail}</button>}>
              <span className={email ? "font-semibold break-all" : "text-fg-muted"}>{email || s.wizard.noEmail}</span>
            </Row>
          </dl>

          <h2 className="mt-6 text-sm font-semibold text-fg-muted">{s.prefs.title}</h2>

          <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={s.prefs.whenTitle}>
            {(["match", "daily"] as const).map((m) => {
              const on = prefs.mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={busy}
                  onClick={() => !on && savePrefs({ ...prefs, mode: m })}
                  className={`rounded-2xl px-3 py-2.5 text-left ring-1 transition ${on ? "bg-white text-ink ring-white" : "bg-white/5 ring-white/10 hover:bg-white/10"}`}
                >
                  <span className="block text-sm font-semibold">{m === "match" ? s.prefs.modeMatch : s.prefs.modeDaily}</span>
                  <span className={`block text-xs ${on ? "text-ink/70" : "text-fg-muted"}`}>{m === "match" ? s.prefs.modeMatchHelp : s.prefs.modeDailyHelp}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-2 grid gap-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
              <span className="relative inline-flex h-6 w-10 shrink-0 items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={prefs.includeOfficial}
                  disabled={busy}
                  onChange={(e) => savePrefs({ ...prefs, includeOfficial: e.target.checked })}
                />
                <span className="absolute inset-0 rounded-full bg-white/15 transition peer-checked:bg-ok/70 peer-focus-visible:ring-2 peer-focus-visible:ring-accent" />
                <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{s.prefs.officialTitle}</span>
                <span className="block text-xs text-fg-muted">{s.prefs.officialHelp}</span>
              </span>
            </label>

            <label className="flex flex-col gap-2 rounded-2xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span>
                <span className="block text-sm font-semibold">{s.prefs.earliestTitle}</span>
                <span className="block text-xs text-fg-muted">{s.prefs.earliestHelp}</span>
              </span>
              <select
                className="field py-1.5 text-sm sm:w-auto"
                value={prefs.earliestHour}
                disabled={busy}
                onChange={(e) => savePrefs({ ...prefs, earliestHour: Number(e.target.value) })}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>
                    {h === 12 ? s.prefs.noon : `${h} am`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-2">
            <PushButton />
          </div>

          {statusLine}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button type="button" onClick={sendTest} disabled={busy} className="btn-ghost text-sm">
              {testing ? s.prefs.testSending : s.prefs.testButton}
            </button>
            <button type="button" onClick={remove} disabled={busy} className="btn-ghost text-sm text-danger">
              {s.notify.stop}
            </button>
          </div>
          <p className="mt-2 text-xs text-fg-faint">{s.prefs.testHelp}</p>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4 text-xs text-fg-faint">
            <span>
              {existing?.agreedAt
                ? s.agree.agreedOn(new Date(existing.agreedAt).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { year: "numeric", month: "long", day: "numeric" }))
                : ""}
            </span>
            <button type="button" onClick={signOut} disabled={busy} className="link">
              {s.auth.signOut}
            </button>
          </div>
        </section>
      </div>
    );
  }

  // ---------- wizard steps ----------
  const idx = STEP_INDEX[step];
  const total = s.wizard.steps.length;

  return (
    <div className="mx-auto max-w-lg">
      <Progress steps={s.wizard.steps} current={idx} label={s.wizard.stepOf(idx + 1, total)} />

      <section className="glass glass-strong mt-4 rounded-3xl p-6 sm:p-8">
        {step === "phone" && (
          <form onSubmit={requestCode}>
            {smsPending && (
              <div className="mb-5 rounded-2xl border border-amber-300/40 bg-amber-300/15 p-4 text-sm">
                <p className="font-semibold text-amber-200">{s.auth.pendingTitle}</p>
                <p className="mt-1 text-fg-muted">{s.auth.pendingBody}</p>
              </div>
            )}
            <h2 className="text-xl font-bold sm:text-2xl">{s.wizard.phoneTitle}</h2>
            <p className="mt-2 text-sm text-fg-muted">{s.wizard.phoneHelp}</p>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder={s.notify.phonePlaceholder}
              aria-label={s.notify.phoneLabel}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="field mt-5 text-xl"
              required
              autoFocus
            />
            <p className="mt-2 text-xs text-fg-faint">{s.notify.usNumbers}</p>
            {statusLine}
            <button type="submit" disabled={smsPending || busy || phone.replace(/\D/g, "").length < 10} className="btn-primary mt-6 w-full">
              {busy ? s.auth.sending : s.auth.sendCode}
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={verify}>
            <h2 className="text-xl font-bold sm:text-2xl">{s.wizard.codeTitle}</h2>
            <p className="mt-2 text-sm text-fg-muted">{s.wizard.codeHelp(sentTo)}</p>
            {devCode && <p className="mt-3 rounded-xl bg-white/8 px-3 py-2 text-xs text-fg-muted">{s.auth.devCode(devCode)}</p>}
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              aria-label={s.auth.codePlaceholder}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="field mt-5 text-center text-3xl tracking-[0.5em]"
              required
              autoFocus
            />
            {statusLine}
            <button type="submit" disabled={busy || code.length !== 6} className="btn-primary mt-6 w-full">
              {busy ? s.auth.verifying : s.auth.verify}
            </button>
            <div className="mt-4 flex justify-between text-sm">
              <button type="button" className="link" onClick={() => { setStep("phone"); setStatus({ kind: "idle" }); }}>{s.wizard.back}</button>
              <button type="button" className="link" onClick={() => requestCode()} disabled={busy}>{s.auth.resend}</button>
            </div>
          </form>
        )}

        {step === "colors" && (
          <form onSubmit={(e) => { e.preventDefault(); if (editing) void save("done"); else { setStatus({ kind: "idle" }); setStep("email"); } }}>
            <h2 className="text-xl font-bold sm:text-2xl">{s.wizard.colorsTitle}</h2>
            <p className="mt-2 text-sm text-fg-muted">{s.wizard.colorsHelp}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {known.length === 0 && <span className="text-sm text-fg-faint">{s.notify.loading}</span>}
              {known.map((c) => {
                const on = selected.includes(c.key);
                return (
                  <button
                    type="button"
                    key={c.key}
                    onClick={() => toggle(c.key)}
                    aria-pressed={on}
                    className={`flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-medium transition ${
                      on ? "bg-white text-ink" : "bg-white/6 text-fg-muted ring-1 ring-white/10 hover:bg-white/10 hover:text-fg"
                    }`}
                  >
                    <span className="h-5 w-5 rounded-full ring-1 ring-black/20" style={{ background: c.hex, boxShadow: on ? `0 0 12px ${c.hex}` : undefined }} />
                    {name(c)}
                  </button>
                );
              })}
            </div>
            {statusLine}
            <div className="mt-6 flex items-center justify-between gap-3">
              <span className="flex flex-wrap items-center gap-x-3 text-sm text-fg-muted">
                {editing ? (
                  <button type="button" className="link" onClick={() => { setEditing(false); loadSubscriber(existing); setStep("done"); }}>{s.wizard.back}</button>
                ) : (
                  <button type="button" className="link" disabled={busy} onClick={signOut} title={s.auth.changeNumber}>{s.wizard.back}</button>
                )}
                {!editing && <span>{s.wizard.selectedCount(selected.length)}</span>}
              </span>
              <button type="submit" disabled={busy || selected.length === 0} className="btn-primary">
                {busy ? s.notify.saving : editing ? s.wizard.saveAndReturn : s.wizard.next}
              </button>
            </div>
          </form>
        )}

        {step === "email" && (
          <form onSubmit={(e) => { e.preventDefault(); if (editing) void save("done"); else { setStatus({ kind: "idle" }); setStep("agree"); } }}>
            <h2 className="text-xl font-bold sm:text-2xl">{s.wizard.emailTitle}</h2>
            <p className="mt-2 text-sm text-fg-muted">{s.wizard.emailHelp}</p>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-label={s.wizard.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field mt-5 text-lg"
              autoFocus
            />
            {statusLine}
            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                className="link text-sm"
                onClick={() => (editing ? (setEditing(false), loadSubscriber(existing), setStep("done")) : (setStatus({ kind: "idle" }), setStep("colors")))}
              >
                {s.wizard.back}
              </button>
              <div className="flex items-center gap-3">
                {!editing && (
                  <button type="button" className="link text-sm" disabled={busy} onClick={() => { setEmail(""); setStatus({ kind: "idle" }); setStep("agree"); }}>
                    {s.wizard.skip}
                  </button>
                )}
                <button type="submit" disabled={busy} className="btn-primary">
                  {busy ? s.notify.saving : editing ? s.wizard.saveAndReturn : s.wizard.continue_}
                </button>
              </div>
            </div>
          </form>
        )}

        {step === "agree" && (
          <form onSubmit={(e) => { e.preventDefault(); if (agreed) void save("done", { agree: true }); }}>
            <h2 className="text-xl font-bold sm:text-2xl">{s.agree.title}</h2>
            <p className="mt-2 text-sm text-fg-muted">{s.agree.intro}</p>
            <div className="mt-5 rounded-2xl border border-white/15 bg-black/25 p-4 text-sm leading-relaxed">
              {s.agree.text}
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 accent-white"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                required
              />
              <span className="text-base font-semibold">{s.agree.checkbox}</span>
            </label>
            {statusLine}
            <div className="mt-6 flex items-center justify-between gap-3">
              <button type="button" className="link text-sm" onClick={() => { setStatus({ kind: "idle" }); setStep("email"); }}>
                {s.wizard.back}
              </button>
              <button type="submit" disabled={busy || !agreed} className="btn-primary">
                {busy ? s.notify.saving : s.wizard.finish}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function Progress({ steps, current, label }: { steps: readonly string[]; current: number; label: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-fg-muted">
        <span>{label}</span>
        <span className="font-medium text-fg">{steps[current]}</span>
      </div>
      <ol className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
        {steps.map((name, i) => (
          <li
            key={name}
            aria-current={i === current ? "step" : undefined}
            className={`h-1.5 rounded-full transition ${i < current ? "bg-white/70" : i === current ? "bg-white" : "bg-white/15"}`}
            title={name}
          />
        ))}
      </ol>
    </div>
  );
}

function Row({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr_auto] items-center gap-3 py-3.5">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="text-base">{children}</dd>
      <dd className="text-xs">{action}</dd>
    </div>
  );
}
