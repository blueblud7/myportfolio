import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { hashPassword, createSessionToken, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json() as { username: string; password: string };
  if (!username?.trim() || !password?.trim())
    return NextResponse.json({ error: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
  if (password.length < 6)
    return NextResponse.json({ error: "비밀번호는 6자 이상이어야 합니다." }, { status: 400 });
  const sql = getDb();
  const existing = await sql`SELECT id FROM users WHERE username=${username}`;
  if (existing.length > 0)
    return NextResponse.json({ error: "이미 사용 중인 아이디입니다." }, { status: 409 });
  const hash = hashPassword(password);
  await sql`INSERT INTO users (username, password_hash) VALUES (${username}, ${hash})`;
  const token = await createSessionToken(username);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", maxAge: 60*60*24*30, path: "/" });
  return res;
}
