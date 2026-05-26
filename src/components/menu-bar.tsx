import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

type Item = { label: string; hot: string; href: string };

const BASE_ITEMS: Item[] = [
  { label: "Domů", hot: "D", href: "/" },
  { label: "Katalog", hot: "K", href: "/colors" },
  { label: "Pravidla", hot: "P", href: "/terms" },
  { label: "Soukromí", hot: "S", href: "/privacy" },
  { label: "Kontakt", hot: "o", href: "/contact" },
];

function highlight(label: string, hot: string) {
  const idx = label.indexOf(hot);
  if (idx < 0) return label;
  return (
    <>
      {label.slice(0, idx)}
      <span className="hot">{label[idx]}</span>
      {label.slice(idx + 1)}
    </>
  );
}

export async function MenuBar() {
  const user = await getCurrentUser();
  const items: Item[] = [...BASE_ITEMS];
  if (user) items.push({ label: "Můj účet", hot: "M", href: "/dashboard" });

  return (
    <div className="menubar">
      <span className="menubar-brand">
        <span style={{ color: "var(--c4)" }}>◆</span> <b>K</b>upSiOdstín
      </span>
      {items.map((it) => (
        <Link key={it.href} className="menubar-item" href={it.href}>
          {highlight(it.label, it.hot)}
        </Link>
      ))}
      <span className="menubar-spacer" />
      {user ? (
        <>
          <span className="menubar-item" style={{ cursor: "default" }}>
            <span style={{ color: "var(--c14)" }}>●</span>
            &nbsp;{user.username}
          </span>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="menubar-item">
              <span className="hot">O</span>dhlásit
            </button>
          </form>
        </>
      ) : (
        <Link className="menubar-item" href="/login">
          <span className="hot">P</span>řihlásit
        </Link>
      )}
    </div>
  );
}
