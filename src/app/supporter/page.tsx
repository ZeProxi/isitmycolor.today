import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";
import { env } from "@/lib/env";
import { ready } from "@/lib/config";
import { getSubscriber } from "@/lib/dynamo";
import { resolveSupporterLink, stopUrl, textUrl } from "@/lib/supporters";
import { PageSkeleton } from "@/components/PageSkeleton";
import { SupporterText } from "@/components/SupporterText";

/**
 * Where the links in a sponsor's or support person's emails land: accepting an invitation (a=confirm),
 * adding their own number for texts (a=text), and stopping (a=stop). The emails carry /api/supporter/...
 * addresses, which send the browser here.
 *
 * Opening this page changes nothing. Mail scanners open every link in a message, so accepting and
 * stopping only happen when the button is pressed, which posts back to /api/supporter/....
 */
export const metadata: Metadata = { title: "Support person", robots: { index: false, follow: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function SupporterPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const pretty = (n: string) => n.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");

function Shell({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <article className="pt-10 sm:pt-16">
      <h1 className="max-w-2xl text-4xl font-bold sm:text-5xl">{title}</h1>
      {children}
    </article>
  );
}

async function Content({ searchParams }: { searchParams: Search }) {
  await connection(); // every answer here depends on the link and the database: never prerendered
  await ready();
  const sp = await searchParams;
  const a = one(sp.a);
  const p = one(sp.p);
  const e = one(sp.e).toLowerCase();
  const tok = one(sp.t);
  const done = one(sp.done) === "1";
  const s = t(await getLang()).supporterPages;
  const purpose = a === "confirm" || a === "stop" || a === "text" ? a : null;

  const home = (
    <p className="mt-6">
      <Link href="/" className="link text-sm">
        {s.home}
      </Link>
    </p>
  );
  const body = "mt-3 max-w-prose text-fg-muted";

  const id = purpose ? await resolveSupporterLink(purpose, p, e, tok).catch(() => null) : null;
  // The alert a "stop" was for can be gone by the time this page shows the result; that is still "stopped".
  if (!id && purpose === "stop" && done) {
    return (
      <Shell title={s.stoppedTitle}>
        <p className={body}>{s.stoppedBody}</p>
        {home}
      </Shell>
    );
  }
  if (!id || !purpose) {
    return (
      <Shell title={s.invalidTitle}>
        <p className={body}>{s.invalidBody}</p>
        {home}
      </Shell>
    );
  }

  const sub = await getSubscriber(id);
  const me = sub?.supporters?.find((x) => x.email === e);
  const who = sub?.name || s.someone;
  const q = new URLSearchParams({ p, e, t: tok }).toString();

  if (purpose === "stop") {
    if (done || !me) {
      return (
        <Shell title={s.stoppedTitle}>
          <p className={body}>{s.stoppedBody}</p>
          {home}
        </Shell>
      );
    }
    return (
      <Shell title={s.stopTitle}>
        <p className={body}>{s.stopBody(who)}</p>
        <form method="post" action={`/api/supporter/stop?${q}`} className="mt-6">
          <button type="submit" className="btn-primary">
            {s.stopButton}
          </button>
        </form>
        <p className="mt-4 text-sm text-fg-muted">{s.stopKeep}</p>
      </Shell>
    );
  }

  if (purpose === "confirm") {
    if (!sub || !me) {
      return (
        <Shell title={s.goneTitle}>
          <p className={body}>{s.goneBody}</p>
          {home}
        </Shell>
      );
    }
    if (me.status === "active") {
      // Texts are their own choice, made by them: offered here and in each email once texting is switched on.
      const texts = env.smsPending ? null : await textUrl(sub, e);
      return (
        <Shell title={s.confirmedTitle}>
          <p className={body}>{s.confirmedBody(who)}</p>
          {texts && (
            <p className="mt-6">
              <a href={texts} className="btn-ghost">
                {s.wantText}
              </a>
            </p>
          )}
          {/* Where to turn it off, said here and now: otherwise the only link is in an alert that may be days away. */}
          <section className="mt-10 max-w-prose border-t border-white/10 pt-6">
            <h2 className="text-base font-semibold">{s.changeMindTitle}</h2>
            <p className="mt-1 text-sm text-fg-muted">{one(sp.mail) === "1" ? s.changeMindSent : s.changeMindBody}</p>
            <p className="mt-3">
              <a href={await stopUrl(sub, e)} className="link text-sm">
                {s.stopButton}
              </a>
            </p>
          </section>
          {home}
        </Shell>
      );
    }
    return (
      <Shell title={s.confirmTitle(who)}>
        <p className={body}>{s.confirmBody(who)}</p>
        <p className={body}>{s.confirmStop}</p>
        <form method="post" action={`/api/supporter/confirm?${q}`} className="mt-6">
          <button type="submit" className="btn-primary">
            {s.confirmYes}
          </button>
        </form>
        <p className="mt-4 text-sm text-fg-muted">{s.confirmNo}</p>
      </Shell>
    );
  }

  // a=text: only for someone who has accepted the emails
  if (!sub || !me || me.status !== "active") {
    return (
      <Shell title={s.inactiveTitle}>
        <p className={body}>{s.inactiveBody}</p>
        {home}
      </Shell>
    );
  }
  return <SupporterText action={`/api/supporter/text?${q}`} who={who} initial={me.sms ? "on" : env.smsPending ? "notyet" : "ask"} phone={me.sms ? pretty(me.sms) : ""} />;
}
