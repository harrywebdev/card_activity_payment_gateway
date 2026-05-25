import "server-only";
import { prisma } from "@/lib/db";

export function isAuthorizedCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers.get("authorization") === `Bearer ${expected}`;
}

export async function recordHeartbeat(
  jobName: string,
  status: "ok" | "error",
  message?: string,
) {
  await prisma.systemHeartbeat.upsert({
    where: { jobName },
    create: {
      jobName,
      lastRunAt: new Date(),
      lastStatus: status,
      lastMessage: message ?? null,
    },
    update: {
      lastRunAt: new Date(),
      lastStatus: status,
      lastMessage: message ?? null,
    },
  });
}
