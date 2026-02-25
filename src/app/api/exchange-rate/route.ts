import { NextResponse } from "next/server";
import { getLatestExchangeRate } from "@/lib/exchange-rate";

export async function GET() {
  const rate = await getLatestExchangeRate();
  return NextResponse.json({ rate });
}
