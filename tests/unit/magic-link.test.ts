import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { issueMagicLink, verifyMagicLink } from "@/lib/magic-link";

describe("issueMagicLink", () => {
  it("creates a token row for an allowlisted email", async () => {
    await issueMagicLink("marek.burc@gmail.com");
    const rows = await prisma.magicLinkToken.findMany({});
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("marek.burc@gmail.com");
    expect(rows[0].usedAt).toBeNull();
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("is silent for a non-allowlisted email (no token row, no throw)", async () => {
    await issueMagicLink("stranger@example.com");
    const count = await prisma.magicLinkToken.count();
    expect(count).toBe(0);
  });

  it("normalises email (trim + lowercase)", async () => {
    await issueMagicLink("  Marek.Burc@Gmail.com  ");
    const row = await prisma.magicLinkToken.findFirst({});
    expect(row?.email).toBe("marek.burc@gmail.com");
  });
});

describe("verifyMagicLink", () => {
  async function freshToken(email = "marek.burc@gmail.com") {
    await issueMagicLink(email);
    const row = await prisma.magicLinkToken.findFirstOrThrow({
      where: { email, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return row.token;
  }

  it("returns ok + userId + username on first verify, creating the user", async () => {
    const token = await freshToken();
    const result = await verifyMagicLink(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.username).toMatch(/^[a-z]{5}$/);
      const u = await prisma.user.findUnique({ where: { id: result.userId } });
      expect(u?.email).toBe("marek.burc@gmail.com");
      expect(u?.username).toBe(result.username);
    }
  });

  it("blocks re-use of the same token", async () => {
    const token = await freshToken();
    const r1 = await verifyMagicLink(token);
    expect(r1.ok).toBe(true);
    const r2 = await verifyMagicLink(token);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe("used");
  });

  it("returns username stable across logins for the same email", async () => {
    const t1 = await freshToken();
    const r1 = await verifyMagicLink(t1);
    expect(r1.ok).toBe(true);

    const t2 = await freshToken();
    const r2 = await verifyMagicLink(t2);
    expect(r2.ok).toBe(true);

    if (r1.ok && r2.ok) {
      expect(r1.userId).toBe(r2.userId);
      expect(r1.username).toBe(r2.username);
    }
  });

  it("rejects an expired token", async () => {
    await issueMagicLink("marek.burc@gmail.com");
    const row = await prisma.magicLinkToken.findFirstOrThrow({});
    await prisma.magicLinkToken.update({
      where: { token: row.token },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    const result = await verifyMagicLink(row.token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("rejects an unknown token", async () => {
    const result = await verifyMagicLink("0".repeat(64));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });
});
