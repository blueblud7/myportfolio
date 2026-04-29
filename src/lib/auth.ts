import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { getDb } from "./db";

export const SESSION_COOKIE = "session";

const SECRET_STR =
  process.env.SESSION_SECRET ?? "myportfolio-secret-blueming-2024-please-change";

const SECRET_KEY = new TextEncoder().encode(SECRET_STR);

export function hashPassword(password: string): string {
  return crypto
    .createHash("sha256")
    .update(password + SECRET_STR)
    .digest("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

export async function createSessionToken(username: string): Promise<string> {
  return new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(SECRET_KEY);
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return payload.username as string;
  } catch {
    return null;
  }
}

export async function getSessionUser(
  req: NextRequest
): Promise<{ id: number; username: string } | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const username = await verifySessionToken(token);
  if (!username) return null;
  const sql = getDb();
  const rows = await sql`SELECT id, username FROM users WHERE username = ${username}`;
  const user = rows[0] as { id: number; username: string } | undefined;
  return user ?? null;
}
