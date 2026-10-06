import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/site/theme-provider";

import { siteUrl } from "@/lib/site";

import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "photocn - The photo editor for shadcn/ui",
    template: "%s - photocn",
  },
  description:
    "The photo editor for shadcn/ui. Typed React components on a WebGL engine: add the whole editor with one command, or compose your own.",
  metadataBase: new URL(siteUrl),
  authors: [{ name: "rbbydotdev", url: "https://github.com/rbbydotdev" }],
  openGraph: {
    type: "website",
    siteName: "photocn",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "photocn: the photo editor for shadcn/ui" }],
  },
  twitter: { card: "summary_large_image", creator: "@rbbydotdev", images: ["/og.png"] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Let the editor use the full screen on notched phones (safe-area insets).
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      lang="en"
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background font-sans text-foreground">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
