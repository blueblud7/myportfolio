import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sub = await req.json();
  const endpoint: string | undefined = sub?.endpoint;
  const p256dh: string | undefined = sub?.keys?.p256dh;
  const auth: string | undefined = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }
  const userAgent = req.headers.get("user-agent");

  const sql = getDb();
  await sql`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    VALUES (${user.id}, ${endpoint}, ${p256dh}, ${auth}, ${userAgent})
    ON CONFLICT (endpoint) DO UPDATE SET
      user_id = ${user.id},
      p256dh = ${p256dh},
      auth = ${auth},
      user_agent = ${userAgent}
  `;
  return NextResponse.json({ success: true });
}
