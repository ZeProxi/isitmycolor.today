"use client";

import { useState } from "react";
import { useLang } from "./LangProvider";

export function ContactForm() {
  const { s } = useLang();
  const [message, setMessage] = useState("");
  const [from, setFrom] = useState("");
  const [name, setName] = useState("");
  const [website, setWebsite] = useState(""); // honeypot: humans never see it
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    setErr("");
    try {
      const r = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, from, name, website }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error === "rate_limited" ? s.contact.rateLimited : d.error === "message_length" ? s.contact.tooShort : d.error === "invalid_email" ? s.notify.invalidEmail : s.contact.failed);
        return setState("error");
      }
      setMessage("");
      setState("sent");
    } catch {
      setErr(s.notify.network);
      setState("error");
    }
  }

  if (state === "sent") {
    return <p className="glass rounded-2xl px-4 py-3 text-sm text-ok">{s.contact.sent}</p>;
  }

  return (
    <form onSubmit={submit} className="glass rounded-3xl p-5 sm:p-6">
      <h2 className="text-2xl font-bold">{s.contact.title}</h2>
      <p className="mt-1 text-sm text-fg-muted">{s.contact.help}</p>
      <textarea
        className="field mt-4 min-h-28 text-sm"
        placeholder={s.contact.messagePlaceholder}
        aria-label={s.contact.title}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={2000}
        required
      />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input className="field text-sm" placeholder={s.contact.namePlaceholder} aria-label={s.contact.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <input className="field text-sm" type="email" placeholder={s.contact.emailPlaceholder} aria-label={s.contact.emailPlaceholder} value={from} onChange={(e) => setFrom(e.target.value)} required />
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="absolute -left-[9999px] h-px w-px opacity-0" aria-hidden />
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
      <button type="submit" disabled={state === "busy" || message.trim().length < 10 || !from.includes("@")} className="btn-primary mt-4 text-sm">
        {state === "busy" ? s.contact.sending : s.contact.send}
      </button>
    </form>
  );
}
