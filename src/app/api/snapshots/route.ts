import { NextRequest, NextResponse } from "next/server";
import { createDailySnapshot, getSnapshots } from "@/lib/snapshot";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const snapshots = await getSnapshots(searchParams.get("start") ?? undefined, searchParams.get("end") ?? undefined);
  return NextResponse.json(snapshots);
}

export async function POST() {
  const created = await createDailySnapshot();
  return NextResponse.json({ created });
}
