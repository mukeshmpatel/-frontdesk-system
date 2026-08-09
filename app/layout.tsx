import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./home-adoption.css";
import AaiqAppShell from "./components/aaiq-app-shell";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const socialImage = `${origin}/og-aaiq.png`;

  return {
    title: "AAI Q — Everything important, remembered",
    description: "Turn messages, email, voice, video, and staff events into one private intelligent memory calendar.",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "AAI Q",
    },
    formatDetection: {
      telephone: false,
    },
    openGraph: {
      title: "AAI Q",
      description: "Messages, email, voice, video, and staff events — remembered with smart alerts and one-tap responses.",
      url: origin,
      siteName: "AAI Q",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "AAI Q intelligent memory calendar" }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "AAI Q",
      description: "Messages, email, voice, video, and staff events — remembered with smart alerts and one-tap responses.",
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#12182B",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><AaiqAppShell>{children}</AaiqAppShell></body>
    </html>
  );
}
