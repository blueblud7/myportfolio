import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listDigests, generateDigest, type DigestPeriod } from "@/lib/digest";
import { generateAgentDigest } from "@/lib/agent-digest";

export const maxDuration = 300;

const VALID: DigestPeriod[] = ["daily", "weekly", "monthly"];

function parsePeriod(v: string | null): DigestPeriod | undefined {
  return v && VALID.includes(v as DigestPeriod) ? (v as DigestPeriod) : undefined;
}

// 목록 조회
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const period = parsePeriod(req.nextUrl.searchParams.get("period"));
  const digests = await listDigests(user.id, period);
  return NextResponse.json({ digests });
}

// 수동 생성/갱신 (크론 전에도 즉시 받아보기 + 새로고침)
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const period = parsePeriod(body?.period) ?? "daily";
  const agent = body?.agent === true;

  // 파이프라인 모드만 과도한 재생성 방지(같은 기간 오늘분이 30분 내면 재사용).
  // 에이전트 모드는 사용자가 명시적으로 누르는 비싼 작업이라 항상 새로 생성.
  if (!agent) {
    const existing = await listDigests(user.id, period, 1);
    if (existing.length > 0) {
      const fresh = Date.now() - new Date(
        existing[0].created_at.endsWith("Z") ? existing[0].created_at : existing[0].created_at + "Z",
      ).getTime() < 30 * 60 * 1000;
      const isToday = existing[0].date === new Date(new Date().getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      if (fresh && isToday) return NextResponse.json({ digest: existing[0], regenerated: false });
    }
  }

  try {
    const rec = agent
      ? await generateAgentDigest(user.id, period)
      : await generateDigest(user.id, period);
    if (!rec) return NextResponse.json({ error: "보유 종목이 없습니다", digest: null }, { status: 400 });
    return NextResponse.json({ digest: rec, regenerated: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
