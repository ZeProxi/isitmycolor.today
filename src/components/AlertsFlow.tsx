"use client";

import { useEffect, useId, useRef, useState } from "react";
import { colorInfo, everyoneCalled, matchedColors, type ColorInfo } from "@/lib/colors";
import { DayMoment } from "./DayMoment";
import { useLang } from "./LangProvider";
import { PushButton } from "./PushButton";
import { AlertHistory } from "./AlertHistory";

type Prefs = { mode: "match" | "daily"; earliestHour: number; endDate?: string };
const DEFAULT_PREFS: Prefs = { mode: "match", earliestHour: 6 };
type Kind = "sms" | "email";
type Contacts = { sms?: string; email?: string };
type Subscriber = {
  phone: string; // the account id, not necessarily a number
  colors: string[];
  lang?: string;
  prefs?: Prefs;
  agreedAt?: string;
  smsStopped?: string;
  emailStopped?: { at: string; reason: "bounce" | "complaint" | "unsubscribe"; email: string };
  agreementVersion?: number;
  lastNotifiedDate?: string;
  name?: string;
  supporters?: SupportPerson[];
};
type SupportPerson = { email: string; status: "invited" | "active"; text?: boolean };
type Step = "loading" | "channel" | "signin" | "phone" | "email" | "code" | "colors" | "when" | "agree" | "support" | "test" | "done";
const AGREEMENT_VERSION = 1;
const hasAgreed = (sub: Subscriber | null) => !!sub?.agreedAt && (sub.agreementVersion ?? 0) >= AGREEMENT_VERSION;
type Status = { kind: "idle" | "busy" | "ok" | "err"; msg?: string };

/** Progress bar position: choosing and entering a contact, its code, colors, timing, agreement, then the two optional extras. */
const STEP_INDEX: Record<Exclude<Step, "loading" | "done">, number> = { channel: 0, signin: 0, phone: 0, email: 0, code: 1, colors: 2, when: 3, agree: 4, support: 5, test: 6 };

/**
 * One question per screen:
 *   how to reach you -> number and/or email, each proven with a code -> colors -> timing -> agree
 *   -> (alerts are on from here) invite a support person -> send a test -> done
 * The last two are optional and can be skipped; leaving the page there loses nothing.
 * Returning people enter the number or email they used and land on "done",
 * where either channel can be added, replaced or removed.
 */
/** "+18777453950" -> "877-745-3950" for the START instructions. */
const prettyNumber = (n: string) => n.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3") || "the number that texts you";
/** "+18015551234" -> "(801) 555-1234" */
const prettyPhone = (n: string) => n.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");

export function AlertsFlow({ smsPending = false, smsNumber = "" }: { smsPending?: boolean; smsNumber?: string }) {
  const { lang, s } = useLang();
  const c = s.channels;
  const [step, setStep] = useState<Step>("loading");
  const [want, setWant] = useState<Kind | "both">(smsPending ? "email" : "sms");
  const [phone, setPhone] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [pending, setPending] = useState<{ kind: Kind; value: string } | null>(null); // where the code went
  const [contacts, setContacts] = useState<Contacts>({});
  const [linking, setLinking] = useState(false);
  const [returning, setReturning] = useState(false); // came in through "Already signed up? Sign in"
  const [identifier, setIdentifier] = useState(""); // the number or email typed on the sign-in screen // adding or replacing a channel from the summary card
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [known, setKnown] = useState<ColorInfo[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [agreed, setAgreed] = useState(false);
  const [smsAgreed, setSmsAgreed] = useState(false); // "I agree to receive automated text alerts": never pre-ticked
  const [unaffiliatedOk, setUnaffiliatedOk] = useState(false); // "I understand this website is not affiliated…"
  const [existing, setExisting] = useState<Subscriber | null>(null);
  const [supporting, setSupporting] = useState<{ name: string; status: "invited" | "active"; link: string }[]>([]); // people this email is a support person for
  const [editing, setEditing] = useState(false); // came from "done" to tweak one thing
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const verifying = useRef(false);

  // Already signed in? Skip the sign-in steps.
  useEffect(() => {
    fetch("/api/me")
      .then(async (r) => {
        if (r.status === 401) return setStep("channel");
        const d = await r.json();
        setContacts(d.contacts ?? {});
        setSupporting(d.supporting ?? []);
        loadSubscriber(d.subscriber);
        setStep(!d.subscriber ? "colors" : hasAgreed(d.subscriber) ? "done" : "agree");
      })
      .catch(() => setStep("channel"));
    fetch("/api/known-colors")
      .then((r) => r.json())
      .then((d) => setKnown(d.colors ?? []))
      .catch(() => {});
  }, []);

  // Messages don't linger: a confirmation clears itself after a few seconds, and so does an error on the
  // settings screen, where it floats over the page. (During sign-up an error sits under the field it is
  // about, and stays until the person tries again.)
  useEffect(() => {
    const ms = status.kind === "ok" ? 3500 : status.kind === "err" && step === "done" ? 7000 : 0;
    if (!ms) return;
    const id = setTimeout(() => setStatus((cur) => (cur === status ? { kind: "idle" } : cur)), ms);
    return () => clearTimeout(id);
  }, [status, step]);

  // Auto-verify as soon as 6 digits are in.
  useEffect(() => {
    if (step === "code" && code.length === 6 && !verifying.current) void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step]);

  function loadSubscriber(sub: Subscriber | null) {
    setExisting(sub);
    setSelected(sub?.colors ?? []);
    setPrefs(sub?.prefs ?? DEFAULT_PREFS);
  }

  /** Settings on the summary card save as soon as they change. */
  async function savePrefs(next: Prefs) {
    const prev = prefs;
    setPrefs(next);
    setStatus({ kind: "busy", msg: s.prefs.saving });
    try {
      const { r, d } = await call("/api/me", "PUT", { colors: selected, lang, prefs: next });
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

  /** Send a code to the number or address being entered (or resend to the last one). */
  async function requestCode(kind: Kind, e?: React.FormEvent, signin?: { value: string }) {
    e?.preventDefault();
    setStatus({ kind: "busy" });
    try {
      const body = signin
        ? kind === "sms" ? { phone: signin.value, signin: true } : { email: signin.value }
        : kind === "sms" ? { phone, consent: smsAgreed && unaffiliatedOk } : { email: emailInput };
      const { r, d } = await call("/api/auth/send-code", "POST", body);
      if (!r.ok) {
        const msg =
          d.error === "rate_limited" ? s.auth.tooMany
          : d.error === "sms_failed" ? s.auth.smsFailed
          : d.error === "email_failed" ? c.emailFailed
          : d.error === "quota" ? c.quota
          : d.error === "opted_out" ? s.auth.optedOut(prettyNumber(smsNumber))
          : d.error === "invalid_phone" ? s.notify.phoneLabel
          : d.error === "consent_required" ? c.smsAgreeNeeded
          : d.error === "invalid_email" ? c.invalidEmail
          : s.auth.wrongCode;
        return setStatus({ kind: "err", msg });
      }
      setPending({ kind: d.kind, value: d.sentTo });
      setReturning(!!signin);
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
    if (verifying.current || !pending) return;
    verifying.current = true;
    setStatus({ kind: "busy" });
    try {
      const { r, d } = await call("/api/auth/verify", "POST", pending.kind === "sms" ? { phone: pending.value, code } : { email: pending.value, code });
      if (!r.ok) {
        const msg = d.error === "expired" ? s.auth.expired : d.error === "too_many" ? s.auth.tooMany : s.auth.wrongCode;
        setCode("");
        return setStatus({ kind: "err", msg });
      }
      const got: Contacts = d.contacts ?? {};
      setContacts(got);
      setSupporting(d.supporting ?? []);
      loadSubscriber(d.subscriber);
      setDevCode(null);
      setPhone("");
      setEmailInput("");
      const ready = d.subscriber && hasAgreed(d.subscriber);
      // Signing up with both, and the first one turned out to have an alert already: still collect the
      // second, so it is added to that alert instead of being quietly dropped.
      const other = !linking && !returning && want === "both" ? (!got.email ? "email" : !got.sms ? "phone" : null) : null;
      if (ready && other) {
        setStatus({ kind: "idle" });
        return setStep(other);
      }
      if (linking || ready) {
        // Back on (or straight to) the summary card. Someone who went through sign-up with a contact that
        // already has an alert is told that this is it, so they don't think a second one was made.
        setLinking(false);
        setStatus(linking ? { kind: "ok", msg: d.merged ? c.merged : c.linked } : returning ? { kind: "idle" } : { kind: "ok", msg: d.merged ? c.merged : c.alreadyHad });
        return setStep(ready ? "done" : d.subscriber ? "agree" : "colors");
      }
      setStatus({ kind: "idle" });
      // Signing up with both: the other one still needs its own code.
      if (want === "both" && !got.email) return setStep("email");
      if (want === "both" && !got.sms) return setStep("phone");
      setStep(d.subscriber ? "agree" : "colors");
    } catch {
      setStatus({ kind: "err", msg: s.notify.network });
    } finally {
      verifying.current = false;
    }
  }

  async function save(nextStep: Step, extra?: { agree?: boolean }) {
    setStatus({ kind: "busy" });
    const colors = [...selected];
    try {
      const { r, d } = await call("/api/me", "PUT", { colors, lang, prefs, agree: extra?.agree === true });
      if (r.status === 401) return signedOut();
      if (!r.ok) return setStatus({ kind: "err", msg: s.notify.saveFailed });
      loadSubscriber(d.subscriber);
      setContacts(d.contacts ?? contacts);
      setEditing(false);
      setAgreed(false);
      setStatus(nextStep === "done" ? { kind: "ok", msg: s.wizard.saved } : { kind: "idle" });
      setStep(nextStep);
    } catch {
      setStatus({ kind: "err", msg: s.notify.network });
    }
  }

  /** From the summary card: add or replace a channel. It is proven with a code like at sign-up. */
  function startLink(kind: Kind, prefill = "") {
    setLinking(true);
    setSmsAgreed(false);
    setUnaffiliatedOk(false);
    setPhone("");
    setEmailInput(kind === "email" ? prefill : "");
    setStatus({ kind: "idle" });
    setStep(kind === "sms" ? "phone" : "email");
  }

  async function removeChannel(kind: Kind) {
    setStatus({ kind: "busy" });
    try {
      const { r, d } = await call(`/api/me/contact?kind=${kind}`, "DELETE");
      if (r.status === 401) return signedOut();
      if (!r.ok) return setStatus({ kind: "err", msg: d.error === "last_contact" ? c.lastContact : s.notify.removeFailed });
      setContacts(d.contacts ?? {});
      setExisting(d.subscriber);
      setStatus({ kind: "ok", msg: c.removed });
    } catch {
      setStatus({ kind: "err", msg: s.notify.network });
    }
  }

  const [invited, setInvited] = useState(0); // support people added during sign-up: turns "Skip" into "Next"
  // The sign-up test step: where the last test went, and how long until "Send again" is offered.
  const [lastTest, setLastTest] = useState<{ where: string; email: boolean; sms: boolean; dry: boolean } | null>(null);
  const [testWait, setTestWait] = useState(0);
  useEffect(() => {
    if (testWait <= 0) return;
    const id = setTimeout(() => setTestWait((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [testWait]);
  // What today holds for them, shown as the drop-down banner the moment sign-up finishes.
  const [finale, setFinale] = useState<{ kind: "mine" | "clear"; hex: string; ink: string } | null>(null);
  const [testCount, setTestCount] = useState(0); // bumps so the history list refreshes after a test
  async function sendTest() {
    setStatus({ kind: "busy", msg: s.prefs.testSending });
    try {
      const { r, d } = await call("/api/me/test", "POST");
      setTestCount((n) => n + 1);
      if (r.status === 401) return signedOut();
      if (!r.ok) {
        const msg = d.error === "limit" ? c.testLimit : d.error === "sms_stopped" ? s.prefs.smsStopped(prettyNumber(smsNumber)) : c.testFailed;
        return setStatus({ kind: "err", msg });
      }
      setTestWait(30);
      if (d.dryRun) {
        setLastTest({ where: "", email: false, sms: false, dry: true });
        return setStatus({ kind: "ok", msg: c.testDry });
      }
      const where = [
        d.sms === "sent" && contacts.sms ? prettyPhone(contacts.sms) : null,
        d.email === "sent" && contacts.email ? contacts.email : null,
        d.push === "sent" ? c.thisDevice : null,
      ].filter(Boolean);
      setLastTest({ where: where.join(", "), email: d.email === "sent", sms: d.sms === "sent", dry: false });
      setStatus({ kind: "ok", msg: c.testSent(where.join(", ")) });
    } catch {
      setStatus({ kind: "err", msg: s.notify.network });
    }
  }

  /**
   * Leaves sign-up for the Alerts page. On the way, looks up today's colors: if today's list is in, the
   * same banner the Today page shows once a day ("your color is up" or "not listed today") drops here
   * first and is counted as today's, so the first visit to Today afterwards has nothing left to play.
   * Any trouble getting the colors and they simply land on the Alerts page.
   */
  async function finishSetup() {
    setStatus({ kind: "busy" });
    let found: typeof finale = null;
    try {
      const r = await Promise.race([fetch("/api/colors"), new Promise<never>((_, no) => setTimeout(() => no(new Error("slow")), 2500))]);
      const d = (await r.json()) as { isForToday?: boolean; layout?: string; colors?: { key: string; raw: string; english: string; spanish: string; siteBackground?: string }[] };
      const list = d.colors ?? [];
      if (r.ok && d.isForToday && list.length > 0 && d.layout !== "fallback" && selected.length > 0) {
        const keys = new Set(list.map((x) => x.key));
        const matched = matchedColors(selected, keys);
        const first = list.find((x) => matched.includes(x.key)) ?? (everyoneCalled(keys) && matched.length ? list[0] : undefined);
        const info = first ? colorInfo(first.key, first) : null;
        found = { kind: matched.length ? "mine" : "clear", hex: first ? (first.siteBackground ?? info!.hex) : "#edb058", ink: info ? info.text : "#fff" };
      }
    } catch {
      // no banner; the Alerts page is the important part
    }
    setFinale(found);
    setStatus({ kind: "idle" });
    setStep("done");
    if (found) setTimeout(() => setFinale(null), 6000); // played once: coming back to this screen later doesn't replay it
  }

  async function remove() {
    setStatus({ kind: "busy" });
    try {
      const { r } = await call("/api/me", "DELETE");
      if (r.status === 401) return signedOut();
      if (!r.ok) return setStatus({ kind: "err", msg: s.notify.removeFailed });
      loadSubscriber(null);
      setStatus({ kind: "ok", msg: c.stoppedAll });
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
    setSupporting([]);
    setContacts({});
    setPending(null);
    setCode("");
    setPhone("");
    setEmailInput("");
    setSmsAgreed(false);
    setUnaffiliatedOk(false);
    setLastTest(null);
    setTestWait(0);
    setEditing(false);
    setLinking(false);
    setReturning(false);
    setIdentifier("");
    setStep("channel");
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
  const dateLocale = lang === "es" ? "es-US" : "en-US";

  if (step === "loading") return <div className="panel mx-auto h-72 max-w-lg animate-pulse rounded-lg" />;

  // ---------- done: the settings screen ----------
  if (step === "done") {
    const st = s.settings;
    const chosen = selected.map((k) => known.find((x) => x.key === k) ?? null);
    const names = chosen.map((x, i) => (x ? name(x) : selected[i])).join(" & ");
    const hourLabel = prefs.earliestHour === 12 ? "12 pm" : `${prefs.earliestHour} am`;
    const testing = status.kind === "busy" && status.msg === s.prefs.testSending;
    return (
      <div className="mx-auto max-w-lg space-y-7">
        {finale && <DayMoment autoplay kind={finale.kind} hex={finale.hex} ink={finale.ink} label={s.home.yoursUp} clearLabel={s.emailSubject.noMatch} />}
        <header>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-ok text-ink">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h1 className="text-3xl font-bold">{names ? s.wizard.doneTitleFor(names) : s.wizard.doneTitle}</h1>
          </div>
          <p className="mt-2 text-sm text-fg-muted">{prefs.mode === "daily" ? c.summaryDaily(hourLabel) : c.summaryMatch(hourLabel)}</p>
        </header>

        {existing?.emailStopped && contacts.email && (
          <p className="rounded-md border border-amber-300/40 bg-amber-300/15 px-4 py-3 text-sm text-fg-muted">
            {c.emailOff(contacts.email, existing.emailStopped.reason)}{" "}
            <button type="button" className="link" disabled={busy} onClick={() => startLink("email", contacts.email)}>
              {c.verifyAgain}
            </button>
          </p>
        )}
        {existing?.smsStopped && contacts.sms && (
          <p className="rounded-md border border-amber-300/40 bg-amber-300/15 px-4 py-3 text-sm text-fg-muted">{s.prefs.smsStopped(prettyNumber(smsNumber))}</p>
        )}

        <Group
          title={st.colors(selected.length)}
          action={
            <button type="button" className="link" onClick={() => { setEditing(true); setStep("colors"); setStatus({ kind: "idle" }); }}>
              {c.change}
            </button>
          }
        >
          <div className="flex flex-wrap gap-2 px-4 py-3.5">
            {chosen.map((x, i) =>
              x ? (
                <span key={x.key} className="rounded px-3 py-1.5 text-sm font-bold" style={{ background: x.hex, color: x.text }}>
                  {name(x)}
                </span>
              ) : (
                <span key={selected[i]} className="rounded bg-white/10 px-3 py-1.5 text-sm font-bold">{selected[i]}</span>
              ),
            )}
          </div>
        </Group>

        <Group title={st.where}>
          <Line
            label={c.textRow}
            value={contacts.sms ? prettyPhone(contacts.sms) : c.notSet}
            dim={!contacts.sms}
          >
            {!contacts.sms && smsPending ? (
              <span className="text-xs text-fg-faint">{c.soon}</span>
            ) : (
              <ChannelActions has={!!contacts.sms} canRemove={!!contacts.email} labels={c} busy={busy} onSet={() => startLink("sms")} onRemove={() => removeChannel("sms")} />
            )}
          </Line>
          <Line label={c.emailRow} value={contacts.email || c.notSet} dim={!contacts.email}>
            <ChannelActions has={!!contacts.email} canRemove={!!contacts.sms} labels={c} busy={busy} onSet={() => startLink("email")} onRemove={() => removeChannel("email")} />
          </Line>
          <PushButton className="px-4 py-3" title={st.device} help={st.deviceHelp} />
        </Group>

        <Supporters
          key={existing?.phone}
          initial={existing?.supporters ?? []}
          initialName={existing?.name ?? ""}
          busy={busy}
          setStatus={setStatus}
          onGone={signedOut}
        />

        <Group title={st.when}>
          <Line label={st.send}>
            <div className="flex overflow-hidden rounded-md border border-line-strong text-sm" role="radiogroup" aria-label={c.whenTitle}>
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
                    className={`px-3 py-1.5 font-medium ${on ? "bg-fg text-ink" : "text-fg-muted hover:text-fg"}`}
                  >
                    {m === "match" ? st.onlyMine : st.everyDay}
                  </button>
                );
              })}
            </div>
          </Line>
          <Line label={st.earliest} hint={st.earliestHelp}>
            <select
              className="field w-auto py-1.5 text-sm"
              aria-label={st.earliest}
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
          </Line>
          <EndDateField
            row
            value={prefs.endDate}
            disabled={busy}
            labels={{ ...c, endTitle: st.optOut }}
            locale={dateLocale}
            onChange={(endDate) => savePrefs({ ...prefs, endDate })}
          />
        </Group>

        <Group title={st.check}>
          <div className="px-4 py-3.5">
            <button type="button" onClick={sendTest} disabled={busy} className="btn-ghost w-full text-sm sm:w-auto">
              {testing ? s.prefs.testSending : c.testButton}
            </button>
            <p className="mt-2 text-xs text-fg-faint">{st.testHelp}</p>
            <AlertHistory refreshKey={testCount} />
          </div>
        </Group>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-fg-faint">
          <span>
            {existing?.agreedAt
              ? s.agree.agreedOn(new Date(existing.agreedAt).toLocaleDateString(dateLocale, { year: "numeric", month: "long", day: "numeric" }))
              : ""}
          </span>
          <span className="flex items-center gap-4">
            <button type="button" onClick={signOut} disabled={busy} className="link">
              {s.auth.signOut}
            </button>
            <button type="button" onClick={remove} disabled={busy} className="font-medium text-danger underline underline-offset-4">
              {s.notify.stop}
            </button>
          </span>
        </div>

        {/* Settings save as you change them; say so wherever the person is on the page. */}
        {status.msg && status.kind !== "busy" && (
          <button
            type="button"
            role="status"
            key={status.msg /* a new message slides in again */}
            onClick={() => setStatus({ kind: "idle" })}
            className={`toast-in fixed bottom-24 right-4 z-40 block max-w-[calc(100vw-2rem)] rounded-md border bg-ink px-4 py-2.5 text-left text-sm font-medium shadow-lg shadow-black/40 sm:max-w-sm md:bottom-6 md:right-6 ${
              status.kind === "err" ? "border-danger text-danger" : "border-ok/60 text-ok"
            }`}
          >
            {status.msg}
          </button>
        )}
      </div>
    );
  }

  // ---------- wizard steps ----------
  const testing = status.kind === "busy" && status.msg === s.prefs.testSending;
  const idx = STEP_INDEX[step];
  const total = c.steps.length;
  const backFromContact = () => {
    setStatus({ kind: "idle" });
    if (linking) {
      setLinking(false);
      setStep("done");
    } else setStep("channel");
  };

  return (
    <div className="mx-auto max-w-lg">
      {!linking && <Progress steps={c.steps} current={idx} label={s.wizard.stepOf(idx + 1, total)} />}

      <section className="panel mt-4 rounded-lg p-6 sm:p-8">
        {step === "channel" && (
          <form onSubmit={(e) => { e.preventDefault(); setStatus({ kind: "idle" }); setStep(want === "email" ? "email" : "phone"); }}>
            <h2 className="text-xl font-bold sm:text-2xl">{c.chooseTitle}</h2>
            <p className="mt-2 text-sm text-fg-muted">{c.chooseHelp}</p>
            <div className="mt-5 grid gap-2" role="radiogroup" aria-label={c.chooseTitle}>
              {(["sms", "email", "both"] as const).map((k) => {
                const on = want === k;
                // While texting awaits approval, "Both" can't be completed, but "Text" can still be opened: its
                // screen shows the full opt-in wording (with the send button off), which reviewers need to see.
                const off = smsPending && k === "both";
                const soon = smsPending && k !== "email";
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={off}
                    onClick={() => setWant(k)}
                    className={`flex items-center justify-between gap-3 rounded-md px-4 py-3 text-left ring-1 ${
                      on ? "bg-white text-ink ring-white" : off ? "bg-white/5 opacity-50 ring-white/10" : "bg-white/5 ring-white/10 hover:bg-white/10"
                    }`}
                  >
                    <span>
                      <span className="block font-semibold">{k === "sms" ? c.text : k === "email" ? c.email : c.both}</span>
                      <span className={`block text-xs ${on ? "text-ink/70" : "text-fg-muted"}`}>{k === "sms" ? c.textHelp : k === "email" ? c.emailHelp : c.bothHelp}</span>
                    </span>
                    {soon && <span className={`shrink-0 text-xs font-medium ${on ? "text-ink/70" : "text-fg-muted"}`}>{c.soon}</span>}
                  </button>
                );
              })}
            </div>
            {smsPending && <p className="mt-4 rounded-md border border-amber-300/40 bg-amber-300/15 px-4 py-3 text-sm text-fg-muted">{c.textSoon}</p>}
            {statusLine}
            <button type="submit" className="btn-primary mt-6 w-full">
              {s.wizard.continue_}
            </button>
            <p className="mt-4 text-center text-sm text-fg-muted">
              {c.already}{" "}
              <button type="button" className="link" onClick={() => { setStatus({ kind: "idle" }); setStep("signin"); }}>
                {c.signIn}
              </button>
            </p>
          </form>
        )}

        {step === "signin" && (
          // Returning people: one field, no boxes to tick again. A number is only texted if it already has an alert.
          <form
            onSubmit={(e) => {
              const v = identifier.trim();
              void requestCode(v.includes("@") ? "email" : "sms", e, { value: v });
            }}
          >
            <h2 className="text-xl font-bold sm:text-2xl">{c.signInTitle}</h2>
            <p className="mt-2 text-sm text-fg-muted">{c.signInHelp}</p>
            <input
              type="text"
              inputMode="email"
              autoComplete="username"
              placeholder="(801) 555-1234 / you@example.com"
              aria-label={c.signInLabel}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="field mt-5 text-lg"
              required
              autoFocus
            />
            {statusLine}
            <button
              type="submit"
              disabled={busy || !(identifier.includes("@") ? /^\S+@\S+\.\S+$/.test(identifier.trim()) : identifier.replace(/\D/g, "").length >= 10)}
              className="btn-primary mt-6 w-full"
            >
              {busy ? s.auth.sending : c.signInSend}
            </button>
            <div className="mt-4 text-sm">
              <button type="button" className="link" onClick={() => { setStatus({ kind: "idle" }); setStep("channel"); }}>{s.wizard.back}</button>
            </div>
          </form>
        )}

        {step === "phone" && (
          <form onSubmit={(e) => requestCode("sms", e)}>
            {smsPending && (
              <div className="mb-5 rounded-md border border-amber-300/40 bg-amber-300/15 p-4 text-sm">
                <p className="font-semibold text-amber-200">{s.auth.pendingTitle}</p>
                <p className="mt-1 text-fg-muted">{s.auth.pendingBody}</p>
              </div>
            )}
            <h2 className="text-xl font-bold sm:text-2xl">{linking ? c.addPhoneTitle : s.wizard.phoneTitle}</h2>
            <p className="mt-2 text-sm text-fg-muted">
              {linking ? c.addHelp : s.wizard.phoneHelp}
              {!linking && (
                <>
                  {" "}
                  {c.already}{" "}
                  <button type="button" className="link" onClick={() => { setStatus({ kind: "idle" }); setIdentifier(phone); setStep("signin"); }}>
                    {c.signIn}
                  </button>
                </>
              )}
            </p>
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
            {/* Consent is given by ticking these, never assumed: both start unticked and both are required. */}
            <label className="mt-5 flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#edb058]" checked={smsAgreed} onChange={(e) => setSmsAgreed(e.target.checked)} required />
              <span className="text-sm font-semibold">{c.smsAgree}</span>
            </label>
            <label className="mt-3 flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#edb058]" checked={unaffiliatedOk} onChange={(e) => setUnaffiliatedOk(e.target.checked)} required />
              <span className="text-sm font-semibold">{c.notAffiliated}</span>
            </label>
            <p className="mt-3 text-xs leading-relaxed text-fg-muted">
              {c.smsConsent} {c.smsConsentLinks}{" "}
              <a className="link" href="/privacy" target="_blank" rel="noreferrer">
                {s.footer.privacy}
              </a>{" "}
              {c.and}{" "}
              <a className="link" href="/terms" target="_blank" rel="noreferrer">
                {s.footer.terms}
              </a>
              .
            </p>
            {statusLine}
            <button type="submit" disabled={smsPending || busy || !smsAgreed || !unaffiliatedOk || phone.replace(/\D/g, "").length < 10} className="btn-primary mt-6 w-full">
              {busy ? s.auth.sending : s.auth.sendCode}
            </button>
            <div className="mt-4 text-sm">
              <button type="button" className="link" onClick={backFromContact}>{s.wizard.back}</button>
            </div>
          </form>
        )}

        {step === "email" && (
          <form onSubmit={(e) => requestCode("email", e)}>
            <h2 className="text-xl font-bold sm:text-2xl">{linking ? c.addEmailTitle : c.emailTitle}</h2>
            <p className="mt-2 text-sm text-fg-muted">{linking ? c.addHelp : c.emailEnterHelp}</p>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-label={c.emailLabel}
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="field mt-5 text-lg"
              required
              autoFocus
            />
            {statusLine}
            <button type="submit" disabled={busy || !/^\S+@\S+\.\S+$/.test(emailInput.trim())} className="btn-primary mt-6 w-full">
              {busy ? s.auth.sending : c.emailSend}
            </button>
            <div className="mt-4 text-sm">
              <button type="button" className="link" onClick={backFromContact}>{s.wizard.back}</button>
            </div>
          </form>
        )}

        {step === "code" && pending && (
          <form onSubmit={verify}>
            <h2 className="text-xl font-bold sm:text-2xl">{s.wizard.codeTitle}</h2>
            <p className="mt-2 text-sm text-fg-muted">
              {returning
                ? c.signInSent(pending.kind === "sms" ? prettyPhone(pending.value) : pending.value)
                : pending.kind === "sms" ? s.wizard.codeHelp(prettyPhone(pending.value)) : c.codeHelpEmail(pending.value)}
            </p>
            {returning && <p className="mt-2 text-xs text-fg-faint">{c.signInNew}</p>}
            {devCode && <p className="mt-3 rounded-md bg-white/8 px-3 py-2 text-xs text-fg-muted">{c.devCode(devCode)}</p>}
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
              <button
                type="button"
                className="link"
                onClick={() => {
                  // put what they typed back so they can fix it
                  if (pending.kind === "email") setEmailInput(pending.value);
                  setStatus({ kind: "idle" });
                  setStep(returning ? "signin" : pending.kind === "sms" ? "phone" : "email");
                }}
              >
                {s.wizard.back}
              </button>
              <button
                type="button"
                className="link"
                disabled={busy}
                onClick={async () => {
                  setStatus({ kind: "busy" });
                  const { r, d } = await call("/api/auth/send-code", "POST", pending.kind === "sms" ? (returning ? { phone: pending.value, signin: true } : { phone: pending.value, consent: smsAgreed && unaffiliatedOk }) : { email: pending.value }).catch(() => ({ r: null, d: {} as { devCode?: string } }));
                  if (!r?.ok) return setStatus({ kind: "err", msg: (d as { error?: string }).error === "quota" ? c.quota : s.auth.tooMany });
                  setDevCode(d.devCode ?? null);
                  setCode("");
                  setStatus({ kind: "idle" });
                }}
              >
                {s.auth.resend}
              </button>
            </div>
          </form>
        )}

        {step === "colors" && (
          <form onSubmit={(e) => { e.preventDefault(); if (editing) void save("done"); else { setStatus({ kind: "idle" }); setStep("when"); } }}>
            {!editing && !existing && supporting.length > 0 && (
              <div className="mb-6 space-y-3 rounded-md border border-line-strong bg-black/25 p-4 text-sm">
                {supporting.map((p) => (
                  <p key={p.link}>
                    {p.status === "active" ? s.supporter.youSupport(p.name) : s.supporter.youInvited(p.name)}{" "}
                    <a className="link" href={p.link}>
                      {p.status === "active" ? s.supporter.stopThose : s.supporter.seeInvite}
                    </a>
                  </p>
                ))}
                <p className="text-fg-muted">{s.supporter.ownAlertBelow}</p>
              </div>
            )}
            <h2 className="text-xl font-bold sm:text-2xl">{s.wizard.colorsTitle}</h2>
            <p className="mt-2 text-sm text-fg-muted">{s.wizard.colorsHelp}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {known.length === 0 && <span className="text-sm text-fg-faint">{s.notify.loading}</span>}
              {known.map((k) => {
                const on = selected.includes(k.key);
                return (
                  <button
                    type="button"
                    key={k.key}
                    onClick={() => toggle(k.key)}
                    aria-pressed={on}
                    className={`flex items-center gap-2 rounded-md py-1.5 pl-1.5 pr-3 text-sm font-medium ${
                      on ? "bg-white text-ink" : "bg-white/6 text-fg-muted ring-1 ring-white/10 hover:bg-white/10 hover:text-fg"
                    }`}
                  >
                    <span className="h-5 w-5 rounded-sm ring-1 ring-black/20" style={{ background: k.hex }} />
                    {name(k)}
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
                  <button type="button" className="link" disabled={busy} onClick={signOut} title={s.auth.signOut}>{s.wizard.back}</button>
                )}
                {!editing && <span>{s.wizard.selectedCount(selected.length)}</span>}
              </span>
              <button type="submit" disabled={busy || selected.length === 0} className="btn-primary">
                {busy ? s.notify.saving : editing ? s.wizard.saveAndReturn : s.wizard.next}
              </button>
            </div>
          </form>
        )}

        {step === "when" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // Came back here from a later step, so the alert already exists and is agreed to: save the
              // changes and carry on, without asking them to agree a second time.
              if (existing && hasAgreed(existing)) return void save("support");
              setStatus({ kind: "idle" });
              setStep("agree");
            }}
          >
            <h2 className="text-xl font-bold sm:text-2xl">{c.whenStepTitle}</h2>
            <p className="mt-2 text-sm text-fg-muted">{c.whenStepHelp}</p>
            <div className="mt-5 space-y-2" role="radiogroup" aria-label={c.whenStepTitle}>
              {(["match", "daily"] as const).map((m) => {
                const on = prefs.mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPrefs({ ...prefs, mode: m })}
                    className={`block w-full rounded-md px-4 py-3 text-left ${on ? "bg-white text-ink" : "bg-white/6 ring-1 ring-white/10 hover:bg-white/10"}`}
                  >
                    <span className="block text-base font-semibold">{m === "match" ? c.modeMatchTitle : c.modeDailyTitle}</span>
                    <span className={`block text-sm ${on ? "text-ink/70" : "text-fg-muted"}`}>{m === "match" ? c.modeMatchHelp : c.modeDailyHelp}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 rounded-md bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <label htmlFor="wizard-earliest" className="text-sm font-semibold">{c.earliestLabel}</label>
                <select id="wizard-earliest" className="field w-full py-1.5 text-sm sm:w-auto" value={prefs.earliestHour} onChange={(e) => setPrefs({ ...prefs, earliestHour: Number(e.target.value) })}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>
                    {h === 12 ? s.prefs.noon : `${h} am`}
                  </option>
                ))}
                </select>
              </div>
              <p className="mt-2 text-xs text-fg-muted">{c.earliestHelp}</p>
            </div>
            <div className="mt-4">
              <EndDateField value={prefs.endDate} disabled={busy} labels={c} locale={dateLocale} onChange={(endDate) => setPrefs({ ...prefs, endDate })} />
            </div>
            <div className="mt-6 flex items-center justify-between gap-3">
              <button type="button" className="link text-sm" onClick={() => { setStatus({ kind: "idle" }); setStep("colors"); }}>
                {s.wizard.back}
              </button>
              <button type="submit" disabled={busy} className="btn-primary">{busy ? s.notify.saving : s.wizard.next}</button>
            </div>
          </form>
        )}

        {step === "agree" && (
          <form onSubmit={(e) => { e.preventDefault(); if (agreed) void save("support", { agree: true }); }}>
            <h2 className="text-xl font-bold sm:text-2xl">{s.agree.title}</h2>
            <p className="mt-2 text-sm text-fg-muted">{s.agree.intro}</p>
            <div className="mt-5 rounded-md border border-white/15 bg-black/25 p-4 text-sm leading-relaxed">
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
              <button type="button" className="link text-sm" onClick={() => { setStatus({ kind: "idle" }); setStep("when"); }}>
                {s.wizard.back}
              </button>
              <button type="submit" disabled={busy || !agreed} className="btn-primary">
                {busy ? s.notify.saving : s.wizard.finish}
              </button>
            </div>
          </form>
        )}

        {/* From here the alert exists and is on. These two are extras: skipping them, or closing the page, loses nothing. */}
        {step === "support" && (
          <div>
            <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-ok">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              {c.onNow}
            </p>
            <h2 className="text-xl font-bold sm:text-2xl">{c.supportStepTitle}</h2>
            <p className="mb-5 mt-2 text-sm text-fg-muted">{c.supportStepHelp}</p>
            <Supporters key={existing?.phone} initial={existing?.supporters ?? []} initialName={existing?.name ?? ""} busy={busy} setStatus={setStatus} onGone={signedOut} onChange={setInvited} />
            {statusLine}
            <div className="mt-6 flex items-center justify-between gap-3">
              <button type="button" className="link text-sm" disabled={busy} onClick={() => { setStatus({ kind: "idle" }); setStep("when"); }}>
                {s.wizard.back}
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => { setStatus({ kind: "idle" }); setStep("test"); }}>
                {invited > 0 ? s.wizard.next : s.wizard.skip}
              </button>
            </div>
          </div>
        )}

        {step === "test" && (
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">{c.testStepTitle}</h2>
            <p className="mt-2 text-sm text-fg-muted">{c.testStepHelp}</p>
            {!lastTest ? (
              <>
                <button type="button" onClick={sendTest} disabled={busy} className="btn-primary mt-5 w-full">
                  {testing ? s.prefs.testSending : c.testButton}
                </button>
                {status.kind === "err" && statusLine}
                <div className="mt-6 flex items-center justify-between gap-3 text-sm">
                  <button type="button" className="link" onClick={() => { setStatus({ kind: "idle" }); setStep("support"); }}>
                    {s.wizard.back}
                  </button>
                  <button type="button" className="link" disabled={busy} onClick={finishSetup}>
                    {s.wizard.skip}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Stays on screen, unlike the passing confirmation elsewhere: this is what they are checking against. */}
                <p className="mt-5 rounded-md border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok" role="status">
                  {lastTest.dry ? c.testDry : c.testSent(lastTest.where)}
                </p>
                <button type="button" className="btn-primary mt-4 w-full" disabled={busy} onClick={finishSetup}>
                  {c.gotIt}
                </button>
                <div className="mt-5 border-t border-line pt-4 text-sm">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold">{c.notReceived}</span>
                    {testWait > 0 ? (
                      <span className="tabular-nums text-fg-muted">{c.sendAgainIn(testWait)}</span>
                    ) : (
                      <button type="button" className="link" disabled={busy} onClick={sendTest}>
                        {testing ? s.prefs.testSending : c.sendAgain}
                      </button>
                    )}
                  </p>
                  {lastTest.email && <p className="mt-2 text-xs text-fg-muted">{c.spamTip}</p>}
                  {lastTest.sms && <p className="mt-2 text-xs text-fg-muted">{c.textTip}</p>}
                  {status.kind === "err" && statusLine}
                  <p className="mt-3 text-xs text-fg-muted">
                    {c.stillOn}{" "}
                    <button type="button" className="link" disabled={busy} onClick={finishSetup}>
                      {c.finishAnyway}
                    </button>
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

type ChannelLabels = { add: string; change: string; remove: string };

function ChannelActions({ has, canRemove, labels, busy, onSet, onRemove }: { has: boolean; canRemove: boolean; labels: ChannelLabels; busy: boolean; onSet: () => void; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-3">
      <button type="button" className="link" disabled={busy} onClick={onSet}>
        {has ? labels.change : labels.add}
      </button>
      {has && canRemove && (
        <button type="button" className="link" disabled={busy} onClick={onRemove}>
          {labels.remove}
        </button>
      )}
    </span>
  );
}

const END_MONTHS = [3, 6, 12, 18, 24] as const;
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function monthsFromNow(n: number): string {
  const d = new Date();
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); // Jan 31 + 1 month = Feb 28
  return isoDate(d);
}

type EndLabels = { endTitle: string; endTip?: string; endNever: string; endMonths: (n: number) => string; endPick: string; endDateLabel: string; endsOn: (d: string) => string };

/** "Opt me out automatically": never, a few preset spans from today, or a chosen date. */
function EndDateField({ value, disabled, labels, locale, onChange, row = false }: { value?: string; disabled: boolean; labels: EndLabels; locale: string; onChange: (endDate: string | undefined) => void; row?: boolean }) {
  // A saved date shows as "specific date"; a preset stays selected only until the page reloads.
  const [choice, setChoice] = useState<string>(value ? "pick" : "never");
  const shown = !value ? "never" : choice === "never" ? "pick" : choice;
  const selectId = useId();
  const pretty = value ? new Date(`${value}T12:00:00`).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" }) : "";
  return (
    <div className={row ? "px-4 py-3" : "rounded-md bg-white/5 px-3 py-2.5 ring-1 ring-white/10"}>
      {/* Wraps by the room it has, not by screen size: on the Alerts page the controls sit beside the label; in the
          narrower sign-up card they drop onto their own line under it. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <label htmlFor={selectId}>{labels.endTitle}</label>
            <Tip text={labels.endTip} />
          </span>
          {labels.endTip && <span className="block text-xs text-fg-muted sm:hidden">{labels.endTip}</span>}
        </span>
        {/* The choice and, when a specific date is wanted, the date beside it: stacked on a phone, side by side from tablet width up. */}
        <span className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <select
            id={selectId}
            className="field py-1.5 text-sm sm:w-auto"
            value={shown}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              setChoice(v);
              if (v === "never") onChange(undefined);
              else if (v === "pick") onChange(value ?? monthsFromNow(12));
              else onChange(monthsFromNow(Number(v)));
            }}
          >
            <option value="never">{labels.endNever}</option>
            {END_MONTHS.map((n) => (
              <option key={n} value={String(n)}>
                {labels.endMonths(n)}
              </option>
            ))}
            <option value="pick">{labels.endPick}</option>
          </select>
          {shown === "pick" && (
            // Kept only as wide as the date itself: the browser hangs its calendar off the box's left edge,
            // so a full-width box put the calendar far from the icon.
            <input
              type="date"
              className="field block w-auto py-1.5 text-sm"
              aria-label={labels.endDateLabel}
              value={value ?? ""}
              min={isoDate(new Date())}
              disabled={disabled}
              onChange={(e) => e.target.value && onChange(e.target.value)}
            />
          )}
        </span>
      </div>
      {value && <p className={`mt-2 text-xs text-fg-muted ${row ? "sm:text-right" : ""}`}>{labels.endsOn(pretty)}</p>}
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
            className={`h-1 ${i < current ? "bg-white/70" : i === current ? "bg-white" : "bg-white/15"}`}
            title={name}
          />
        ))}
      </ol>
    </div>
  );
}

/** A titled block of settings: a small heading, then rows separated by hairlines. */
function Group({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h2 className="font-sans text-xs font-semibold uppercase tracking-[0.08em] text-fg-faint">{title}</h2>
        {action && <span className="text-xs">{action}</span>}
      </div>
      <div className="panel divide-y divide-line rounded-lg">{children}</div>
    </section>
  );
}

/**
 * One setting: what it is on the left, its value or control on the right.
 * `hint` is a short line always shown under the label. `tip` is a longer explanation: on wider screens it
 * sits behind a "?" beside the label (shown on hover or keyboard focus); on phones, where there is no
 * hover, it is shown under the label instead.
 */
function Line({ label, hint, tip, value, dim, children }: { label: string; hint?: string; tip?: string; value?: string; dim?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {label}
          <Tip text={tip} />
        </span>
        {value !== undefined && <span className={`block break-all text-sm ${dim ? "text-fg-faint" : "text-fg-muted"}`}>{value}</span>}
        {hint && <span className="block text-xs text-fg-muted">{hint}</span>}
        {tip && <span className="block text-xs text-fg-muted sm:hidden">{tip}</span>}
      </span>
      <span className="shrink-0 text-xs">{children}</span>
    </div>
  );
}

/**
 * A small "?" that shows a longer explanation on hover or keyboard focus. Shown from tablet width up only:
 * a phone has no hover, so there the same words are printed under the label by whoever uses this.
 */
function Tip({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <span className="group relative hidden sm:inline-flex">
      <button type="button" aria-label={text} className="flex h-4 w-4 items-center justify-center rounded-full border border-fg-faint text-[10px] font-bold leading-none text-fg-muted hover:border-fg hover:text-fg">
        ?
      </button>
      <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-64 -translate-x-1/2 rounded-md border border-line-strong bg-ink px-3 py-2 text-xs font-normal leading-relaxed text-fg group-focus-within:block group-hover:block">
        {text}
      </span>
    </span>
  );
}

/**
 * "Support people": invite up to two others to get an email on your color days.
 * An invitation is all that's sent until they accept on the page it links to.
 */
function Supporters({ initial, initialName, busy, setStatus, onGone, onChange }: { initial: SupportPerson[]; initialName: string; busy: boolean; setStatus: (s: Status) => void; onGone: () => void; onChange?: (count: number) => void }) {
  const { s } = useLang();
  const t = s.supporter;
  const [people, setPeople] = useState<SupportPerson[]>(initial);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState(initialName);

  async function invite(to: string, e?: React.FormEvent) {
    e?.preventDefault();
    setStatus({ kind: "busy", msg: t.sending });
    try {
      const r = await fetch("/api/me/supporters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: to, name }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) return onGone();
      if (!r.ok) {
        const msg =
          d.error === "invalid_email" ? t.invalidEmail
          : d.error === "name_required" ? t.nameRequired
          : d.error === "own_email" ? t.ownEmail
          : d.error === "too_many" ? t.tooMany
          : d.error === "rate_limited" ? t.rateLimited
          : d.error === "quota" ? s.channels.quota
          : t.failed;
        return setStatus({ kind: "err", msg });
      }
      setPeople(d.supporters ?? []);
      onChange?.((d.supporters ?? []).length);
      setAdding(false);
      setEmail("");
      setStatus({ kind: "ok", msg: t.sent(to.trim().toLowerCase()) });
    } catch {
      setStatus({ kind: "err", msg: s.notify.network });
    }
  }

  async function removePerson(who: string) {
    setStatus({ kind: "busy" });
    try {
      const r = await fetch(`/api/me/supporters?email=${encodeURIComponent(who)}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) return onGone();
      if (!r.ok) return setStatus({ kind: "err", msg: s.notify.removeFailed });
      setPeople(d.supporters ?? []);
      onChange?.((d.supporters ?? []).length);
      setStatus({ kind: "ok", msg: t.removed });
    } catch {
      setStatus({ kind: "err", msg: s.notify.network });
    }
  }

  // Its own group, apart from the holder's own channels, so it's clear these are other people.
  return (
    <Group title={t.title}>
      <p className="px-4 py-3 text-sm text-fg-muted">{t.help}</p>
      {people.map((p) => (
        <Line key={p.email} label={p.email} hint={p.status !== "active" ? t.invited : p.text ? t.activeText : t.active}>
          <span className="flex items-center gap-3">
            {p.status === "invited" && name && (
              <button type="button" className="link" disabled={busy} onClick={() => invite(p.email)}>
                {t.resend}
              </button>
            )}
            <button type="button" className="link" disabled={busy} onClick={() => removePerson(p.email)}>
              {t.remove}
            </button>
          </span>
        </Line>
      ))}
      {!adding && people.length < 2 && (
        <div className="px-4 py-3">
          <button type="button" className="btn-ghost px-3 py-1.5 text-sm" disabled={busy} onClick={() => setAdding(true)}>
            + {t.add}
          </button>
        </div>
      )}
      {adding && (
        <form className="space-y-3 px-4 py-4" onSubmit={(e) => invite(email, e)}>
          <label className="block text-sm font-semibold">
            {t.emailLabel}
            <input type="email" inputMode="email" autoComplete="off" required autoFocus placeholder="name@example.com" className="field mt-1.5 font-normal" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm font-semibold">
            {t.nameLabel}
            <input type="text" autoComplete="given-name" required maxLength={40} placeholder={t.namePlaceholder} className="field mt-1.5 font-normal" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="flex items-center justify-end gap-4 pt-1">
            <button type="button" className="link text-sm" onClick={() => setAdding(false)}>
              {t.cancel}
            </button>
            <button type="submit" disabled={busy || !name.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())} className="btn-primary px-4 py-2 text-sm">
              {t.send}
            </button>
          </div>
        </form>
      )}
    </Group>
  );
}
