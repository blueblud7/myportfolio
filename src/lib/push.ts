import webpush from "web-push";
import { getDb } from "./db";

let vapidConfigured = false;

/** VAPID 환경변수로 web-push 1회 설정. 누락 시 false. */
export function configureVapid(): boolean {
  if (vapidConfigured) return true;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * 한 사용자의 모든 구독 기기로 웹푸시 발송.
 * 만료된 구독(404/410)은 자동 정리. { sent, removed } 반환.
 */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  if (!configureVapid()) return { sent: 0, removed: 0 };

  const sql = getDb();
  const subs = (await sql`
    SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${userId}
  `) as { endpoint: string; p256dh: string; auth: string }[];

  const body = JSON.stringify({ url: "/dashboard", ...payload });
  let sent = 0;
  let removed = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      );
      sent++;
    } catch (e) {
      const statusCode = (e as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await sql`DELETE FROM push_subscriptions WHERE endpoint = ${s.endpoint}`;
        removed++;
      }
    }
  }
  return { sent, removed };
}
