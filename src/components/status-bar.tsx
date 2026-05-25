import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { StatusClock } from "@/components/status-clock";

export async function StatusBar() {
  const [user, freeCount, totalCount] = await Promise.all([
    getCurrentUser(),
    prisma.color.count({ where: { currentSubscriptionId: null } }),
    prisma.color.count(),
  ]);

  return (
    <div className="statusbar">
      <span className="key">
        <b>F1</b>&nbsp;Nápověda
      </span>
      <span className="key">
        <b>F2</b>&nbsp;{user ? "Účet" : "Přihlásit"}
      </span>
      <span className="key">
        <b>F3</b>&nbsp;Katalog
      </span>
      <span className="key">
        <b>F10</b>&nbsp;Menu
      </span>
      <span className="statusbar-spacer" />
      <span className="key">
        VOLNÝCH:&nbsp;
        <b style={{ color: "var(--c4)" }}>{freeCount}</b>/{totalCount}
      </span>
      <span className="key blink">
        <StatusClock />
      </span>
    </div>
  );
}
