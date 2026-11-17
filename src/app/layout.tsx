import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, IBM_Plex_Sans } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { Shell } from "@/components/Shell";

const display = Barlow_Condensed({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700"] });
const body = IBM_Plex_Sans({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

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
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "My color" },
};

export const viewport: Viewport = { themeColor: "#131313", viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <Shell>{children}</Shell>
        </Suspense>
      </body>
    </html>
  );
}
