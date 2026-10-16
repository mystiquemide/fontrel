import type { Metadata } from "next";
import { Fragment_Mono, Instrument_Sans, Newsreader } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const fragment = Fragment_Mono({
  variable: "--font-fragment",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3100"),
  title: { default: "fontrel · See the shortage behind the shortage", template: "%s · fontrel" },
  description: "See the shortage behind the shortage. A drug shortage response agent for hospital pharmacy, built on FalkorDB.",
  openGraph: {
    title: "fontrel · See the shortage behind the shortage",
    description: "Trace a drug shortage to the plant that makes it, find what else is exposed, and choose substitutes made somewhere else.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${newsreader.variable} ${instrument.variable} ${fragment.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
