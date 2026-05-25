import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { syncColorCatalogue } from "@/lib/seed-colors";

/**
 * POST /api/admin/seed-colors
 *
 * Idempotently seeds (or re-syncs) the CGA-16 colour catalogue.
 * Protected by the same CRON_SECRET we use for the cron endpoints —
 * no point inventing a second secret for a one-shot admin op.
 *
 * Run once after the first Disco deploy:
 *
 *   curl -sS -X POST \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     https://kupsiodstin.cz/api/admin/seed-colors
 *
 * Safe to re-run on every deploy — idempotent.
 */
export async function POST(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncColorCatalogue();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "seed_failed", message },
      { status: 500 },
    );
  }
}
