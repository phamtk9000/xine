import type { Metadata } from "next";
import { Geist_Mono, Instrument_Serif, Source_Serif_4 } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getCurrentUser } from "@/lib/session";
import "./globals.css";

// Article body copy. Two weights so prose gets a real semibold for <strong>
// rather than a synthesised one, and italic for emphasis.
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  weight: ["400", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
});

// Mono is no longer the site's label face — that's Helvetica Neue now — but
// two things still genuinely want a typewriter: fenced code in prose, and the
// "case file" art direction, whose entire identity is typed-document.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Needed so article open-graph images resolve to absolute URLs.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "xine — cinema, rated and made",
    template: "%s · xine",
  },
  description:
    "An editorial film magazine, a rating system with six axes instead of five stars, and a workspace that takes a film from a one-line idea to a pitch package.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();

  return (
    <html
      lang="en"
      className={`${sourceSerif.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="grain flex min-h-full flex-col bg-ink text-paper">
        <SiteHeader user={user} />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
