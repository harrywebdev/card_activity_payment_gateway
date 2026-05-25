import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kup si Odstín",
  description: "Vlastni jednu barvu. Splácej ji po měsíčních splátkách.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs">
      <body className="antialiased">{children}</body>
    </html>
  );
}
