import "./globals.css";
import type { ReactNode } from "react";
import { Providers } from "./providers";

export const metadata = {
  title: "AI Video Flow",
  description: "Prompt-to-video storyboard editor (mock generator, real editing pipeline)."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
