import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { PwaRegister } from "@/components/PwaRegister";
import {
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TITLE_DEFAULT,
  SITE_TITLE_TEMPLATE,
  SITE_URL,
} from "@/lib/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500"],
});

// 마루부리 (네이버, 명조체) — 제목·히어로 전용. self-host woff2.
const maruburi = localFont({
  variable: "--font-maruburi",
  display: "swap",
  src: [
    { path: "./fonts/maruburi/MaruBuri-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/maruburi/MaruBuri-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/maruburi/MaruBuri-Bold.woff2", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE_DEFAULT,
    template: SITE_TITLE_TEMPLATE,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "finance",
  alternates: {
    canonical: "/",
    languages: {
      ko: "/",
      en: "/en",
      "x-default": "/",
    },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_TITLE_DEFAULT,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "ko_KR",
    alternateLocale: ["en_US"],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE_DEFAULT,
    description: SITE_DESCRIPTION,
  },
  verification: {
    other: {
      "naver-site-verification": "512e4175d98467648f42f5aad40fb9647438a3be",
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Portfolio",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0d12",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark overflow-x-hidden">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} ${maruburi.variable} antialiased overflow-x-hidden`}
      >
        {children}
        <PwaRegister />
        <Analytics />
      </body>
    </html>
  );
}
