import type { Metadata } from "next";
import QRCode from "qrcode";

export const metadata: Metadata = { title: "Flyer", robots: { index: false, follow: false } };

const SITE = "https://isitmycolor.today";

/**
 * /flyer: a one-page printable handout. Print it from the browser (Ctrl/Cmd+P).
 * Kept in English and Spanish on the same sheet so one copy serves everyone.
 */
export default async function FlyerPage() {
  const qr = await QRCode.toString(`${SITE}/notify`, { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } });
  return (
    <div className="flyer mx-auto max-w-[720px] bg-white px-5 py-6 text-black sm:px-10 sm:py-12 print:max-w-none print:px-0 print:py-0">
      <style>{`
        @media print {
          header, footer, nav, .no-print { display: none !important; }
          body, html { background: #fff !important; }
          main { padding: 0 !important; max-width: none !important; }
          .flyer { box-shadow: none; }
        }
      `}</style>
      {/* On a phone this stacks into one column to read; printed, it is always the two-column letter sheet. */}
      <div className="no-print mb-6 rounded-md bg-black/5 px-4 py-3 text-sm">
        <span className="hidden sm:inline">Print this page (Ctrl+P / Cmd+P). It&apos;s sized for a letter sheet.</span>
        <span className="sm:hidden">A one-page handout. Print it from your browser&apos;s menu, or share this page.</span>
      </div>

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4 print:flex-row print:items-center print:gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.webp" alt="" width={119} height={72} className="h-[72px] w-[119px]" />
        <h1 className="text-4xl font-bold leading-none tracking-tight sm:text-5xl print:text-5xl">Wasatch UA Alerts</h1>
      </div>
      <p className="mt-3 text-xl font-semibold text-black/70 sm:text-2xl print:text-2xl">Is it my color today? · ¿Es mi color hoy?</p>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 sm:mt-8 sm:grid-cols-[1fr_220px] sm:gap-8 print:mt-8 print:grid-cols-[1fr_220px] print:gap-8">
        <div className="space-y-4 text-base leading-snug sm:space-y-5 sm:text-lg print:space-y-5 print:text-lg">
          <p>
            <strong>Get an alert on the mornings your UA color is called.</strong> By email or text. Free. No app to install. Sign
            up in about a minute.
          </p>
          <p className="text-black/70">
            <strong>Recibe una alerta las mañanas en que llaman tu color.</strong> Por correo o texto. Gratis. Sin app. Regístrate
            en un minuto.
          </p>
          <ul className="space-y-1 text-base">
            <li>• Today&apos;s colors, large and clear</li>
            <li>• A calendar of past days, with a photo of the official page each day</li>
            <li>• Clinic hours and directions</li>
            <li>• English / Español</li>
          </ul>
        </div>
        <div className="text-center">
          <div className="mx-auto w-[200px] max-w-full rounded-md border-2 border-black p-2 sm:w-[220px] print:w-[220px]" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="mt-2 text-sm font-semibold">Scan to sign up</p>
          <p className="text-sm text-black/60">Escanea para registrarte</p>
        </div>
      </div>

      <p className="mt-8 text-center text-2xl font-bold tracking-tight sm:text-left sm:text-3xl print:text-left print:text-3xl">isitmycolor.today</p>

      <div className="mt-8 border-t-2 border-black pt-4 text-sm leading-snug text-black/70">
        <p>
          <strong className="text-black">Not affiliated with Wasatch Behavioral Health.</strong> A free community tool that re-reads
          the public hotline page. It can be wrong or late. You are still responsible for checking the official page,
          wasatch.org/colors, or calling (385) 268-5002 every day.
        </p>
        <p className="mt-2">
          <strong className="text-black">No está afiliado a Wasatch Behavioral Health.</strong> Herramienta comunitaria gratuita. Puede
          fallar o atrasarse. Sigues siendo responsable de revisar la página oficial o llamar cada día.
        </p>
      </div>
    </div>
  );
}
