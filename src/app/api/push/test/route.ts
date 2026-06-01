import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

let vapidConfigured = false;
function configureVapid(): boolean {
  if (vapidConfigured) return true;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!configureVapid()) {
    return NextResponse.json({ error: "VAPID 환경변수가 설정되지 않았습니다" }, { status: 500 });
  }

  const sql = getDb();
  const subs = (await sql`
    SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${user.id}
  `) as { endpoint: string; p256dh: string; auth: string }[];

  if (subs.length === 0) {
    return NextResponse.json({ error: "구독된 기기가 없습니다", sent: 0 }, { status: 400 });
  }

  const payload = JSON.stringify({
    title: "포트폴리오 알림 테스트",
    body: "푸시 알림이 정상적으로 동작합니다.",
    url: "/dashboard",
  });

  let sent = 0;
  let removed = 0;
  for (const s of subs) {
    const subscription = {
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth },
    };
    try {
      await webpush.sendNotification(subscription, payload);
      sent++;
    } catch (e) {
      const statusCode = (e as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await sql`DELETE FROM push_subscriptions WHERE endpoint = ${s.endpoint}`;
        removed++;
      }
    }
  }

  return NextResponse.json({ success: true, sent, removed });
}
