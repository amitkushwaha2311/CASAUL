/**
 * CAUSAL — Root layout.
 *
 * Sets up the document shell with:
 * - Google Fonts (Inter + JetBrains Mono)
 * - Design token CSS
 * - SEO metadata
 * - AuthProvider for global authentication context
 */

import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: {
    default: "CAUSAL — Causal Resilience & Intervention Engine",
    template: "%s | CAUSAL",
  },
  description:
    "CAUSAL is a domain-independent intelligence platform for interconnected cyber-physical systems. See the cascade before it happens.",
  keywords: ["causal", "infrastructure", "resilience", "intervention", "cyber-physical"],
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#111210",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${jetbrainsMono.variable} ${newsreader.variable}`}
    >
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
