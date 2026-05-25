import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { USERNAME } from "@/lib/config";

const CONSONANTS = USERNAME.consonants;
const VOWELS = USERNAME.vowels;

const DENYLIST = new Set<string>([
  // Add unfortunate generations here as they're discovered.
]);

function pickChar(charset: string): string {
  return charset[randomInt(0, charset.length)];
}

function generateCandidate(): string {
  // CVCVC pattern: consonant-vowel-consonant-vowel-consonant.
  return (
    pickChar(CONSONANTS) +
    pickChar(VOWELS) +
    pickChar(CONSONANTS) +
    pickChar(VOWELS) +
    pickChar(CONSONANTS)
  );
}

/**
 * Generate-and-retry against the unique constraint on User.username.
 * Caps at USERNAME.maxRetries; throws if exhausted (vanishingly unlikely
 * with ~1.77M candidates and an allowlist of a handful of users).
 */
export async function generateUniqueUsername(): Promise<string> {
  for (let i = 0; i < USERNAME.maxRetries; i++) {
    const candidate = generateCandidate();
    if (DENYLIST.has(candidate)) continue;
    const existing = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error(
    `Failed to generate a unique username after ${USERNAME.maxRetries} attempts`,
  );
}
