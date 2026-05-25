import "server-only";
import { prisma } from "@/lib/db";

export type ColorCard = {
  id: string;
  hex: string;
  name: string;
  owner: { username: string } | null;
};

const PAGE_SIZE = 60;

export async function listColors(opts: {
  page?: number;
  ownedOnly?: boolean;
  availableOnly?: boolean;
}): Promise<{ items: ColorCard[]; page: number; pageSize: number; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const where = opts.ownedOnly
    ? { currentSubscriptionId: { not: null } }
    : opts.availableOnly
      ? { currentSubscriptionId: null }
      : {};

  const [rows, total] = await Promise.all([
    prisma.color.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        currentSubscription: {
          select: { user: { select: { username: true } } },
        },
      },
    }),
    prisma.color.count({ where }),
  ]);

  const items: ColorCard[] = rows.map((c) => ({
    id: c.id,
    hex: c.hex,
    name: c.name,
    owner: c.currentSubscription ? { username: c.currentSubscription.user.username } : null,
  }));

  return { items, page, pageSize: PAGE_SIZE, total };
}

export async function getColorByHex(hex: string) {
  const row = await prisma.color.findUnique({
    where: { hex: hex.toLowerCase() },
    include: {
      currentSubscription: {
        include: { user: { select: { username: true } } },
      },
    },
  });
  return row;
}

/**
 * Naive luminance check for picking readable text colour on a swatch.
 */
export function isLightHex(hex: string): boolean {
  const clean = hex.replace(/^#/, "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  // Rec. 709 luma
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.6;
}
