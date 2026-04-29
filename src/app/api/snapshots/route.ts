import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createDailySnapshot, createAccountSnapshots, getSnapshots } from "@/lib/snapshot";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const snapshots = await getSnapshots(
    user.id,
    searchParams.get("start") ?? undefined,
    searchParams.get("end") ?? undefined
  );
  return NextResponse.json(snapshots);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const created = await createDailySnapshot(user.id);
  await createAccountSnapshots(user.id);
  return NextResponse.json({ created });
}
