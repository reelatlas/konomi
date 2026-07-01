import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Konomi — anime tag remixer",
  description: "Pick up to 3 tags, mix them, and get your top series recommendations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- this is the
            App Router root layout, which already applies to every route (the
            app-dir equivalent of pages/_document.js the rule asks for) */}
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
