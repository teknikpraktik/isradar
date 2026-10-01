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
  title: "ISRADAR",
  description:
    "Analysverktyg för långfärdsskridsko: köldmängd, modell-, satellit- och väderdata för svenska vatten.",
  applicationName: "ISRADAR",
  appleWebApp: { capable: true, title: "ISRADAR", statusBarStyle: "black-translucent" },
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
