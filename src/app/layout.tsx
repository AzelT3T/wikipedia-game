import type { Metadata } from "next";
import { JetBrains_Mono, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const appSans = Noto_Sans_JP({
  variable: "--font-app-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const appMono = JetBrains_Mono({
  variable: "--font-app-mono",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "Wiki Link Race",
  description: "Wikipedia internal links race game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${appSans.variable} ${appMono.variable}`}>{children}</body>
    </html>
  );
}

