import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Isvak – Datadriven bevakning av isbildning", template: "%s | Isvak" },
  description:
    "Isvak är en datadriven tjänst för bevakning av isbildning med hjälp av köldmängd, väderdata, prognosmodeller och satellitdata.",
  applicationName: "Isvak",
  openGraph: {
    title: "Isvak – Datadriven bevakning av isbildning",
    description: "Datadriven bevakning av isbildning med köldmängd, väder, prognosmodeller och satellitdata.",
    siteName: "Isvak",
    locale: "sv_SE",
    type: "website",
  },
  appleWebApp: { capable: true, title: "Isvak", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0c1015",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sv" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
