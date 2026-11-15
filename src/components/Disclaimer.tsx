import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";

export async function Disclaimer({ compact = false }: { compact?: boolean }) {
  const s = t(await getLang()).disclaimer;

  if (compact) {
    return (
      <p className="max-w-prose text-sm leading-relaxed text-fg-muted">
        <strong className="text-fg">{s.compactLead}</strong> {s.compact}
      </p>
    );
  }
  return (
    <section className="glass rounded-3xl p-6 sm:p-8">
      <h2 className="text-2xl font-bold">{s.title}</h2>
      <ul className="mt-4 max-w-prose space-y-3 text-sm leading-relaxed text-fg-muted">
        {s.items.map(([lead, body]) => (
          <li key={lead}>
            <strong className="text-fg">{lead}</strong> {body}
          </li>
        ))}
      </ul>
    </section>
  );
}
