import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { Ambient, AmbientLayer } from "@/components/Ambient";
import { Shell } from "@/components/Shell";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});
const body = Manrope({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const SITE = "https://isitmycolor.today";
const TITLE = "Is it my color today?";
const DESCRIPTION =
  "Unofficial, community-built mirror of the Wasatch Behavioral Health UA color hotline, with past days and text alerts for your color. Not affiliated with Wasatch Behavioral Health.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: TITLE, template: `%s · isitmycolor.today` },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "isitmycolor.today",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
    alternateLocale: ["es_US"],
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
  applicationName: "isitmycolor.today",
};

export const viewport: Viewport = { themeColor: "#070b16", viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <Suspense fallback={<AmbientLayer hexes={["#3b5bdb", "#5f3dc4"]} />}>
          <Ambient />
        </Suspense>
        <Suspense fallback={null}>
          <Shell>{children}</Shell>
        </Suspense>
      </body>
    </html>
  );
}
