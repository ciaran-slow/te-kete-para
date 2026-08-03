import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/language-provider";
import { LanguageToggle } from "@/components/language-toggle";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

/* Macrons (ā ē ī ō ū) are Latin Extended-A glyphs: without the latin-ext
   subset they render from a fallback font (FR-01, ADR 0005). */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Te Kete Para",
  description:
    "The bilingual rubbish and recycling companion for Wellington — Te Whanganui-a-Tara.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plusJakartaSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistration />
        <LanguageProvider>
          <header className="flex justify-end px-4 py-3">
            <LanguageToggle />
          </header>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
