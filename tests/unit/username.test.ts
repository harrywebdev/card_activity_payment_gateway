import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { generateUniqueUsername } from "@/lib/username";
import { USERNAME } from "@/lib/config";

const CONSONANTS = new Set(USERNAME.consonants.split(""));
const VOWELS = new Set(USERNAME.vowels.split(""));

function isCVCVC(s: string) {
  if (s.length !== 5) return false;
  return (
    CONSONANTS.has(s[0]) &&
    VOWELS.has(s[1]) &&
    CONSONANTS.has(s[2]) &&
    VOWELS.has(s[3]) &&
    CONSONANTS.has(s[4])
  );
}

describe("generateUniqueUsername", () => {
  it("produces a 5-char CVCVC string from the configured alphabets", async () => {
    const u = await generateUniqueUsername();
    expect(u).toMatch(/^[a-z]{5}$/);
    expect(isCVCVC(u)).toBe(true);
  });

  it("produces values that survive the unique constraint when DB is empty", async () => {
    const us = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const u = await generateUniqueUsername();
      // Reserve it so the next iteration must avoid it.
      await prisma.user.create({ data: { email: `t${i}@x.cz`, username: u } });
      us.add(u);
    }
    expect(us.size).toBe(20);
    for (const u of us) expect(isCVCVC(u)).toBe(true);
  });
});
