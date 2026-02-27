import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyPassword, createSessionToken, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json() as { username: string; password: string };
  const sql = getDb();
  const rows = await sql`SELECT password_hash FROM users WHERE username=${username}`;
  const user = rows[0] as { password_hash: string } | undefined;
  if (!user || !verifyPassword(password, user.password_hash))
    return NextResponse.json({ error: "아이디 또는 비밀번호가 틀렸습니다." }, { status: 401 });
  const token = await createSessionToken(username);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", maxAge: 60*60*24*30, path: "/" });
  return res;
}
