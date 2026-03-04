import { NextResponse } from "next/server";
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
  const puts = options.filter((o) => /P\d{8}$/.test(o.option));

  const callVol = calls.reduce((s, o) => s + (o.volume ?? 0), 0);
  const putVol = puts.reduce((s, o) => s + (o.volume ?? 0), 0);
  const callOI = calls.reduce((s, o) => s + (o.open_interest ?? 0), 0);
  const putOI = puts.reduce((s, o) => s + (o.open_interest ?? 0), 0);

  const useVol = callVol + putVol > 0;
  const callVal = useVol ? callVol : callOI;
  const putVal = useVol ? putVol : putOI;

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
      INSERT INTO pcr_snapshots (date, symbol, pcr, call_volume, put_volume, basis)
      VALUES (${today}, ${d.symbol}, ${d.pcr}, ${d.callVolume}, ${d.putVolume}, ${d.basis})
      ON CONFLICT (date, symbol) DO UPDATE
        SET pcr = EXCLUDED.pcr,
            call_volume = EXCLUDED.call_volume,
            put_volume = EXCLUDED.put_volume
    `;
  }
}

async function loadHistory(): Promise<PCRHistoryPoint[]> {
  const sql = getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = await sql`
    SELECT date, symbol, pcr
    FROM pcr_snapshots
    WHERE symbol IN ('SPY','QQQ')
    ORDER BY date ASC
  `;

  // date 기준으로 피벗
  const map = new Map<string, PCRHistoryPoint>();
  for (const r of rows) {
    if (!map.has(r.date)) map.set(r.date, { date: r.date });
    const point = map.get(r.date)!;
    if (r.symbol === "SPY") point.SPY = parseFloat(r.pcr.toFixed(3));
    if (r.symbol === "QQQ") point.QQQ = parseFloat(r.pcr.toFixed(3));
  }

  return Array.from(map.values());
}

export async function GET() {
  try {
    const [spyResult, qqqResult] = await Promise.allSettled([
      fetchCboePCR("SPY"),
      fetchCboePCR("QQQ"),
    ]);

    const current: PCRData[] = [];
    if (spyResult.status === "fulfilled") current.push(spyResult.value);
    if (qqqResult.status === "fulfilled") current.push(qqqResult.value);

    // 오늘 데이터 DB 저장 (market hours 중에만 의미 있음)
    if (current.length > 0) {
      saveSnapshots(current).catch(() => {});
    }

    const history = await loadHistory();

    const response: PCRResponse = { current, history };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=60" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
