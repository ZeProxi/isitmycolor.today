import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLang } from "@/lib/lang-server";
import { t, isLang } from "@/lib/i18n";
import { env } from "@/lib/env";
import { ready } from "@/lib/config";
import { accountForEmailLink, smsOf } from "@/lib/dynamo";
import { verifyUnsubscribe } from "@/lib/unsubscribe";
import { PageSkeleton } from "@/components/PageSkeleton";

/**
 * Where the "Stop these emails" link in every alert email lands (by way of /api/email/unsubscribe, the
 * address the emails carry). Opening it changes nothing: mail scanners open every link in a message, so
 * the stop only happens when the button is pressed.
 *
 * Stopping emails stops emails. It does not quietly end someone's texts or device alerts, because losing
 * an alert you still wanted is the worse mistake here. Ending everything is offered as its own button.
 */
export const metadata: Metadata = { title: "Stop emails", robots: { index: false, follow: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function StopEmailsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function Content({ searchParams }: { searchParams: Search }) {
  await ready();
  const sp = await searchParams;
  const p = one(sp.p);
  const tok = one(sp.t);
  // Local development only: ?demo=others|only|done|done-only|gone shows each screen without a real account.
  const demo = process.env.NODE_ENV !== "production" ? one(sp.demo) : "";
  const done = demo === "gone" ? "all" : demo.startsWith("done") ? "1" : one(sp.done);
  const valid = !!demo || verifyUnsubscribe(p, tok);
  const real = valid && !demo && done !== "all" ? await accountForEmailLink(p).catch(() => null) : null;
  const sub = demo ? { lang: undefined, sms: demo === "others" || demo === "done" ? "+10000000000" : "", phone: "demo", smsStopped: undefined, push: [] } : real;
  // The page speaks the language the alerts are sent in, when we know it.
  const lang = sub && isLang(sub.lang) ? sub.lang : await getLang();
  const s = t(lang).stopEmails;

  const links = (
    <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
      <Link href="/notify" className="btn-primary">
        {s.alerts}
      </Link>
      <a href={env.sourceUrl} className="link text-sm" target="_blank" rel="noreferrer">
        {s.official}
      </a>
    </div>
  );

  if (valid && done === "all") {
    return (
      <article className="pt-10 sm:pt-16">
        <h1 className="text-4xl font-bold sm:text-5xl">{s.goneTitle}</h1>
        <p className="mt-3 max-w-prose text-fg-muted">{s.goneBody}</p>
        {links}
      </article>
    );
  }

  if (!valid || !sub) {
    return (
      <article className="pt-10 sm:pt-16">
        <h1 className="text-4xl font-bold sm:text-5xl">{s.invalidTitle}</h1>
        <p className="mt-3 max-w-prose text-fg-muted">{s.invalidBody}</p>
        {links}
      </article>
    );
  }

  const others = (!!smsOf(sub) && !sub.smsStopped) || (sub.push?.length ?? 0) > 0;
  const action = `/api/email/unsubscribe?p=${encodeURIComponent(p)}&t=${encodeURIComponent(tok)}`;
  const everything = (
    <section className="mt-10 max-w-prose border-t border-white/10 pt-6">
      <h2 className="text-base font-semibold">{s.allTitle}</h2>
      <p className="mt-1 text-sm text-fg-muted">{s.allBody}</p>
      <form method="post" action={action} className="mt-4">
        <input type="hidden" name="all" value="1" />
        <button type="submit" className="link text-sm">
          {s.all}
        </button>
      </form>
    </section>
  );

  if (done === "1") {
    return (
      <article className="pt-10 sm:pt-16">
        <h1 className="text-4xl font-bold sm:text-5xl">{s.doneTitle}</h1>
        <p className="mt-3 max-w-prose text-fg-muted">{others ? s.doneOthers : s.doneOnly}</p>
        {links}
        {everything}
      </article>
    );
  }

  return (
    <article className="pt-10 sm:pt-16">
      <h1 className="text-4xl font-bold sm:text-5xl">{s.askTitle}</h1>
      <p className="mt-3 max-w-prose text-fg-muted">{others ? s.askOthers : s.askOnly}</p>
      <form method="post" action={action} className="mt-6">
        <button type="submit" className="btn-primary">
          {s.stop}
        </button>
      </form>
      <p className="mt-4 text-sm text-fg-muted">{s.keep}</p>
      {everything}
    </article>
  );
}
