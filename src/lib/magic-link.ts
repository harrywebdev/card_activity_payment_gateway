import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { env, AUTH } from "@/lib/config";
import { sendMagicLink } from "@/lib/email";
import { generateUniqueUsername } from "@/lib/username";

const TOKEN_BYTES = 32; // 64 hex chars

function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

function isAllowlisted(email: string): boolean {
  return env.ALLOWED_EMAILS.includes(email);
}

/**
 * Issue a magic link to the email.
 *
 * Allowlisted email: creates a token row and sends the email.
 * Non-allowlisted email: silent no-op. The caller always shows the
 * same "check your inbox" UI so the form doesn't leak which addresses
 * are recognised.
 */
export async function issueMagicLink(rawEmail: string): Promise<void> {
  const email = normaliseEmail(rawEmail);
  if (!email) return;
  if (!isAllowlisted(email)) return;

  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + AUTH.magicLinkExpiryMinutes * 60_000);

  await prisma.magicLinkToken.create({
    data: { token, email, expiresAt },
  });

  const link = `${env.NEXT_PUBLIC_BASE_URL}/api/auth/verify?token=${token}`;
  await sendMagicLink(email, link);
}

export type VerifyResult =
  | { ok: true; userId: string; username: string }
  | { ok: false; reason: "not_found" | "expired" | "used" | "not_allowed" };

/**
 * Single-use, expiry-checked verification. On first successful verification
 * for an email we create the User row with a fresh CVCVC username.
 */
export async function verifyMagicLink(token: string): Promise<VerifyResult> {
  if (!token) return { ok: false, reason: "not_found" };

  const row = await prisma.magicLinkToken.findUnique({ where: { token } });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt < new Date()) return { ok: false, reason: "expired" };

  const email = normaliseEmail(row.email);
  if (!isAllowlisted(email)) return { ok: false, reason: "not_allowed" };

  // Mark token used first so a parallel double-click can't double-create.
  await prisma.magicLinkToken.update({
    where: { token },
    data: { usedAt: new Date() },
  });

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const username = await generateUniqueUsername();
    user = await prisma.user.create({ data: { email, username } });
  }

  return { ok: true, userId: user.id, username: user.username };
}
