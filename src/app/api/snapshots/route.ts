import { NextRequest, NextResponse } from "next/server";
import { createDailySnapshot, getSnapshots } from "@/lib/snapshot";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("start");
  const endDate = searchParams.get("end");

  const snapshots = getSnapshots(startDate ?? undefined, endDate ?? undefined);
  return NextResponse.json(snapshots);
}

export async function POST() {
  const created = await createDailySnapshot();
  return NextResponse.json({ created });
}
