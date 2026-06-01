import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { ClientLayout } from "@/components/layout/ClientLayout";
import {
  SITE_DESCRIPTION,
  SITE_DESCRIPTION_EN,
  SITE_NAME,
  SITE_TITLE_DEFAULT,
  SITE_TITLE_EN,
} from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isEn = locale === "en";

  const title = isEn ? SITE_TITLE_EN : SITE_TITLE_DEFAULT;
  const description = isEn ? SITE_DESCRIPTION_EN : SITE_DESCRIPTION;
  const canonical = isEn ? "/en" : "/";

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        ko: "/",
        en: "/en",
        "x-default": "/",
      },
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: canonical,
      locale: isEn ? "en_US" : "ko_KR",
      alternateLocale: isEn ? ["ko_KR"] : ["en_US"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ClientLayout>{children}</ClientLayout>
    </NextIntlClientProvider>
  );
}
