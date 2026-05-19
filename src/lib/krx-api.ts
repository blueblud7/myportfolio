// KRX Open API 클라이언트
// - data.go.kr  : ETF 전종목 시세 (서비스키 필요)
// - data.krx.co.kr: ETF 구성종목 (무인증, ISIN 필요)

const DATA_GO_URL =
  "https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService";
const KRX_URL =
  "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";

const KRX_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Referer: "https://data.krx.co.kr/",
  "Content-Type": "application/x-www-form-urlencoded",
};

export interface KrxEtfPrice {
  ticker: string;
  name: string;
  isinCd: string;
  price: number;
  changePct: number;
  volume: number;
  tradingValue: number;
}

export interface KrxHolding {
  ticker: string;
  name: string;
  pct: number;
}

function toKrxDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

function prevTradingDates(from: string, n = 5): string[] {
  const dates: string[] = [];
  const d = new Date(from);
  while (dates.length < n) {
    d.setDate(d.getDate() - 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

// ─── ETF 전종목 시세 (한 번 호출로 전체) ───────────────────────────────────
export async function fetchKrxEtfPrices(
  date?: string,
): Promise<Map<string, KrxEtfPrice>> {
  const key = process.env.KRX_API_KEY;
  if (!key) return new Map();

  const today = date ?? new Date().toISOString().split("T")[0];
  const candidates = [today, ...prevTradingDates(today, 5)].filter((d) => {
    const day = new Date(d).getDay();
    return day !== 0 && day !== 6;
  });

  for (const d of candidates) {
    try {
      const params = new URLSearchParams({
        serviceKey: key,
        numOfRows: "2000",
        pageNo: "1",
        resultType: "json",
        mrktCtg: "ETF",
        basDt: toKrxDate(d),
      });

      const res = await fetch(`${DATA_GO_URL}/getStockPriceInfo?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) continue;

      const json = await res.json();
      const raw: unknown = json?.response?.body?.items?.item;
      const items: Record<string, string>[] = Array.isArray(raw)
        ? (raw as Record<string, string>[])
        : raw
          ? [raw as Record<string, string>]
          : [];

      if (items.length === 0) continue;

      const map = new Map<string, KrxEtfPrice>();
      for (const item of items) {
        const ticker = (item.srtnCd ?? "").trim();
        if (!ticker) continue;
        map.set(ticker, {
          ticker,
          name: item.itmsNm ?? "",
          isinCd: item.isinCd ?? "",
          price: Number((item.clpr ?? "0").replace(/,/g, "")),
          changePct: Number((item.fltRt ?? "0").replace(/,/g, "")),
          volume: Number((item.trqu ?? "0").replace(/,/g, "")),
          tradingValue: Number((item.trPrc ?? "0").replace(/,/g, "")),
        });
      }

      if (map.size > 0) return map;
    } catch {
      continue;
    }
  }

  return new Map();
}

// ─── ETF 구성종목 (ISIN → KRX 직접 API) ────────────────────────────────────
export async function fetchKrxEtfHoldings(
  isinCd: string,
  date?: string,
): Promise<KrxHolding[]> {
  if (!isinCd) return [];

  const today = date ?? new Date().toISOString().split("T")[0];
  // 주말이면 금요일로 당겨서 조회
  const candidates = [today, ...prevTradingDates(today, 3)];
  const trdDd = toKrxDate(
    candidates.find((d) => new Date(d).getDay() !== 0 && new Date(d).getDay() !== 6) ?? today,
  );

  try {
    const body = new URLSearchParams({
      bld: "dbms/MDC/STAT/standard/MDCSTAT04601",
      locale: "ko_KR",
      tboxisuCd_finder_secuprodisu1_0: isinCd.slice(-6),
      isuCd: isinCd,
      isuNm: "",
      param1isuNm: "",
      trdDd,
      share: "1",
      money: "1",
      csvxls_isNo: "false",
    });

    const res = await fetch(KRX_URL, {
      method: "POST",
      headers: KRX_HEADERS,
      body: body.toString(),
    });
    if (!res.ok) return [];

    const json = await res.json();
    const output: Record<string, string>[] = json?.output ?? [];

    return output
      .map((row) => ({
        ticker: (row.ISU_SRT_CD ?? "").trim(),
        name: row.ISU_ABBRV ?? row.ISU_NM ?? "",
        pct: Number((row.COMPST_RT ?? "0").replace(/,/g, "")),
      }))
      .filter((h) => h.ticker && h.pct > 0)
      .slice(0, 20);
  } catch {
    return [];
  }
}
