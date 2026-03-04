import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export interface PCRData {
  symbol: string;
  pcr: number | null;
  callVolume: number;
  putVolume: number;
  basis: "volume" | "openInterest";
}

export interface PCRHistoryPoint {
  date: string;
  SPY?: number;
  QQQ?: number;
  estimated?: boolean; // vix 추정값 여부
}

export interface PCRResponse {
  current: PCRData[];
  history: PCRHistoryPoint[];
}

const CBOE_BASE = "https://cdn.cboe.com/api/global/delayed_quotes/options";

async function fetchCboePCR(symbol: string): Promise<PCRData> {
  const res = await fetch(`${CBOE_BASE}/${symbol}.json`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new Error(`CBOE fetch failed for ${symbol}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  const options: { option: string; volume: number; open_interest: number }[] =
    json?.data?.options ?? [];

  const calls = options.filter((o) => /C\d{8}$/.test(o.option));
  const puts  = options.filter((o) => /P\d{8}$/.test(o.option));

  const callVol = calls.reduce((s, o) => s + (o.volume ?? 0), 0);
  const putVol  = puts.reduce((s,  o) => s + (o.volume ?? 0), 0);
  const callOI  = calls.reduce((s, o) => s + (o.open_interest ?? 0), 0);
  const putOI   = puts.reduce((s,  o) => s + (o.open_interest ?? 0), 0);

  const useVol  = callVol + putVol > 0;
  const callVal = useVol ? callVol : callOI;
  const putVal  = useVol ? putVol  : putOI;

  return {
    symbol,
    pcr: callVal > 0 ? putVal / callVal : null,
    callVolume: callVal,
    putVolume: putVal,
    basis: useVol ? "volume" : "openInterest",
  };
}

async function saveSnapshots(data: PCRData[]) {
  const sql = getDb();
  const today = new Date().toISOString().slice(0, 10);
  for (const d of data) {
    if (d.pcr === null) continue;
    await sql`
      INSERT INTO pcr_snapshots (date, symbol, pcr, call_volume, put_volume, basis, source)
      VALUES (${today}, ${d.symbol}, ${d.pcr}, ${d.callVolume}, ${d.putVolume}, ${d.basis}, 'cboe')
      ON CONFLICT (date, symbol) DO UPDATE
        SET pcr = EXCLUDED.pcr,
            call_volume = EXCLUDED.call_volume,
            put_volume  = EXCLUDED.put_volume,
            source      = 'cboe'
    `;
  }
}

function periodToStartDate(period: string): string {
  const d = new Date();
  switch (period) {
    case "1w":  d.setDate(d.getDate() - 7);   break;
    case "1m":  d.setMonth(d.getMonth() - 1); break;
    case "3m":  d.setMonth(d.getMonth() - 3); break;
    case "6m":  d.setMonth(d.getMonth() - 6); break;
    case "1y":  d.setFullYear(d.getFullYear() - 1); break;
    default:    d.setFullYear(d.getFullYear() - 1); break;
  }
  return d.toISOString().slice(0, 10);
}

async function loadHistory(period: string): Promise<PCRHistoryPoint[]> {
  const sql = getDb();
  const startDate = periodToStartDate(period);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = await sql`
    SELECT date, symbol, pcr, source
    FROM pcr_snapshots
    WHERE symbol IN ('SPY','QQQ')
      AND date >= ${startDate}
    ORDER BY date ASC
  `;

  const map = new Map<string, PCRHistoryPoint>();
  for (const r of rows) {
    if (!map.has(r.date)) {
      map.set(r.date, { date: r.date, estimated: r.source !== "cboe" });
    }
    const point = map.get(r.date)!;
    // 날짜 내 cboe가 하나라도 있으면 estimated=false
    if (r.source === "cboe") point.estimated = false;
    if (r.symbol === "SPY") point.SPY = parseFloat(Number(r.pcr).toFixed(3));
    if (r.symbol === "QQQ") point.QQQ = parseFloat(Number(r.pcr).toFixed(3));
  }

  return Array.from(map.values());
}

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period") ?? "1y";

  try {
    const [spyResult, qqqResult] = await Promise.allSettled([
      fetchCboePCR("SPY"),
      fetchCboePCR("QQQ"),
    ]);

    const current: PCRData[] = [];
    if (spyResult.status === "fulfilled") current.push(spyResult.value);
    if (qqqResult.status === "fulfilled") current.push(qqqResult.value);

    if (current.length > 0) {
      saveSnapshots(current).catch(() => {});
    }

    const history = await loadHistory(period);
    const response: PCRResponse = { current, history };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
