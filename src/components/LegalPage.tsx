export function LegalPage({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: readonly (readonly string[])[];
}) {
  return (
    <article className="space-y-8 pt-6 sm:pt-10">
      <div>
        <h1 className="text-4xl font-bold sm:text-5xl">{title}</h1>
        <p className="mt-2 text-sm text-fg-muted">{updated}</p>
      </div>
      <div className="glass max-w-prose space-y-6 rounded-3xl p-6 text-sm leading-relaxed text-fg-muted sm:p-8">
        {sections.map(([heading = "", body = ""]) => (
          <section key={heading}>
            <h2 className="text-base font-semibold text-fg">{heading}</h2>
            <p className="mt-1">{body}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
