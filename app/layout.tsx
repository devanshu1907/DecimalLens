import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "DecimalLens — Enterprise Financial Intelligence & Audit System",
  description: "Deterministic math verification and document intelligence pipeline.",
  icons: {
    icon: [
      { url: "/favicon-96x96.png?v=1", sizes: "96x96", type: "image/png" },
      { url: "/favicon.svg?v=1", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico?v=1",
    apple: [
      { url: "/apple-touch-icon.png?v=1", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  appleWebApp: {
    title: "DeciLens",
    capable: true,
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", inter.variable, ibmPlexMono.variable, "font-sans", geist.variable)}
    >
      <body className="min-h-full flex flex-col bg-bg text-text-primary font-sans">
        {children}
      </body>
    </html>
  );
}
