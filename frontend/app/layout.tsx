import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ColorSchemeScript } from "@mantine/core";
import "@mantine/core/styles.css";
import "./globals.css";
import "./collage.css";
import { Providers } from "./providers";
import { LOCALE_METADATA, type SupportedLocale } from "@/lib/i18n/locales";
import { BRAND_NAME, BRAND_LOGO_URL, BRAND_ASSET_VERSION } from "@/lib/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${BRAND_NAME} · 穿搭灵感社区`,
  applicationName: BRAND_NAME,
  description: "发现穿搭灵感，整理数字衣橱，用已有的衣服搭出自己的版本。",
  appleWebApp: { title: BRAND_NAME },
  icons: {
    icon: [
      { url: BRAND_LOGO_URL, type: "image/svg+xml" },
      { url: `/favicon.ico?v=${BRAND_ASSET_VERSION}`, sizes: "any" },
      {
        url: `/icon-16.png?v=${BRAND_ASSET_VERSION}`,
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: `/icon-32.png?v=${BRAND_ASSET_VERSION}`,
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: `/icon-192.png?v=${BRAND_ASSET_VERSION}`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: `/icon-512.png?v=${BRAND_ASSET_VERSION}`,
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: `/apple-touch-icon.png?v=${BRAND_ASSET_VERSION}`,
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      dir={LOCALE_METADATA[locale as SupportedLocale]?.dir ?? "ltr"}
      suppressHydrationWarning
    >
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body className="font-sans app-body collage-theme">
        <NextIntlClientProvider messages={messages} locale={locale}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
