/**
 * Renders a saved copy of the hotline page as a static, non-interactive
 * rendering: scripts and forms are stripped, the page's text boxes become plain
 * blocks, and nothing in the frame can be clicked, typed into, or selected.
 * The result is what the page looked like that day, frozen.
 */
export function freezeHotlineHtml(html: string): string {
  return (
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<form\b[^>]*>/gi, "<div>")
      .replace(/<\/form>/gi, "</div>")
      .replace(/\son\w+="[^"]*"/gi, "")
      // hidden inputs (ASP.NET viewstate etc.) carry nothing visible
      .replace(/<input\b[^>]*type="hidden"[^>]*\/?>/gi, "")
      // visible text boxes -> static blocks that keep the inline style (the color)
      .replace(/<input\b([^>]*)\/?>/gi, (_m, attrs: string) => {
        const value = attrs.match(/\bvalue="([^"]*)"/i)?.[1] ?? "";
        const style = attrs.match(/\bstyle="([^"]*)"/i)?.[1] ?? "";
        return `<div class="frozen-input" style="${style}">${value}</div>`;
      })
      .replace(
        /<head>/i,
        `<head><base target="_blank"><style>
          html, body { margin: 0; padding: 16px; background: #fff; }
          * { pointer-events: none !important; user-select: none !important; -webkit-user-select: none !important; }
          .frozen-input { display: flex; align-items: center; box-sizing: border-box; padding: 2px 4px; margin: 2px 0; border: 1px solid #767676; border-radius: 2px; font: 400 18px Arial, sans-serif; color: #000; }
        </style>`,
      )
  );
}

export function SavedPageFrame({
  html,
  caption,
  downloadHref,
  downloadLabel,
}: {
  html: string;
  caption?: string;
  downloadHref?: string;
  downloadLabel?: string;
}) {
  return (
    <figure className="glass overflow-hidden rounded-3xl bg-white">
      <iframe
        srcDoc={freezeHotlineHtml(html)}
        title="Saved copy of wasatch.org/colors"
        className="h-[60vh] w-full"
        sandbox=""
        tabIndex={-1}
        aria-hidden="false"
      />
      {(caption || downloadHref) && (
        <figcaption className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-ink/60">
          <span>{caption ?? ""}</span>
          {downloadHref && (
            <a className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90" href={downloadHref} download>
              {downloadLabel}
            </a>
          )}
        </figcaption>
      )}
    </figure>
  );
}
