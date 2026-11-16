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
    <div className="flyer mx-auto max-w-[720px] bg-white px-10 py-12 text-black print:max-w-none print:px-0 print:py-0">
      <style>{`
        @media print {
          header, footer, nav, .no-print { display: none !important; }
          body, html { background: #fff !important; }
          main { padding: 0 !important; max-width: none !important; }
          .flyer { box-shadow: none; }
        }
      `}</style>
      <div className="no-print mb-6 flex items-center justify-between rounded-2xl bg-black/5 px-4 py-3 text-sm">
        <span>Print this page (Ctrl+P / Cmd+P). It&apos;s sized for a letter sheet.</span>
      </div>

      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark.svg" alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-2xl" />
        <h1 className="text-5xl font-extrabold leading-none tracking-tight">Is it my color today?</h1>
      </div>
      <p className="mt-3 text-2xl font-semibold text-black/70">¿Es mi color hoy?</p>

      <div className="mt-8 grid grid-cols-[1fr_220px] items-start gap-8">
        <div className="space-y-5 text-lg leading-snug">
          <p>
            <strong>Get a text on the mornings your UA color is called.</strong> Free. No app to install. Sign up with your phone
            number in about a minute.
          </p>
          <p className="text-black/70">
            <strong>Recibe un texto las mañanas en que llaman tu color.</strong> Gratis. Sin app. Regístrate con tu número de
            celular en un minuto.
          </p>
          <ul className="space-y-1 text-base">
            <li>• Today&apos;s colors, large and clear</li>
            <li>• A calendar of past days, with a photo of the official page each day</li>
            <li>• Clinic hours and directions</li>
            <li>• English / Español</li>
          </ul>
        </div>
        <div className="text-center">
          <div className="mx-auto w-[220px] rounded-xl border-2 border-black p-2" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="mt-2 text-sm font-semibold">Scan to sign up</p>
          <p className="text-sm text-black/60">Escanea para registrarte</p>
        </div>
      </div>

      <p className="mt-8 display text-3xl font-bold tracking-tight">isitmycolor.today</p>

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
