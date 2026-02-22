import type { Metadata } from "next";
import Script from "next/script";

import "./globals.css";
import Providers from "@/components/providers";

export const metadata: Metadata = {
  title: "Strategic Projects Portal",
  description: "Business Case and Placemat management portal"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {`(() => {
            try {
              const theme = localStorage.getItem("spp-theme") || "light";
              if (theme === "dark") document.documentElement.classList.add("dark");
            } catch {}
          })();`}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
