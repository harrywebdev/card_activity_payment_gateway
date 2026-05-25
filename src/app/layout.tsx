import type { Metadata } from "next";
import { MenuBar } from "@/components/menu-bar";
import { StatusBar } from "@/components/status-bar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kup si Odstín — vlastni jednu barvu",
  description:
    "Vyber si jeden ze 16 odstínů z CGA palety a vlastni ho. Splácej v měsíčních splátkách.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=VT323&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="crt">
          <MenuBar />
          <div className="desk">
            <div className="desk-scroll">
              {children}
              <div style={{ height: 24 }} />
              <div
                className="center"
                style={{ color: "var(--c8)", fontSize: 18 }}
              >
                ─ ─ ─ KupSiOdstin.cz · (C) 2026 · Powered by IBM PC compatible & Otto Bohuš vibes ─ ─ ─
              </div>
            </div>
          </div>
          <StatusBar />
        </div>
      </body>
    </html>
  );
}
