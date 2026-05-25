import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { redirect } from "next/navigation";
import { AUTH, BRAND_NAME, env } from "@/lib/config";

export type SessionData = {
  userId?: string;
  username?: string;
};

const sessionOptions: SessionOptions = {
  password: env.COOKIE_SECRET,
  cookieName: "kupsiodstin_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: AUTH.sessionDays * 24 * 60 * 60,
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session.userId || !session.username) return null;
  return { id: session.userId, username: session.username };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function setSession(data: { userId: string; username: string }) {
  const session = await getSession();
  session.userId = data.userId;
  session.username = data.username;
  await session.save();
}

export async function destroySession() {
  const session = await getSession();
  session.destroy();
}

export const APP_BRAND = BRAND_NAME;
