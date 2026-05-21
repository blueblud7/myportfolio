// KRX (한국거래소) Open API
// OTP 인증 방식: GenerateOTP → CheckOTP

const KRX_BASE = "https://openapi.krx.co.kr";

function formatKrxDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// KST 기준으로 가장 최근 거래일 (주말 제외)
function recentTradingDay(daysBack = 0): string {
  const now = new Date();
  // KST = UTC+9
  now.setTime(now.getTime() + 9 * 60 * 60 * 1000);
  now.setDate(now.getDate() - daysBack);
  while (now.getDay() === 0 || now.getDay() === 6) now.setDate(now.getDate() - 1);
  return formatKrxDate(now);
}

async function krxRequest(bld: string, params: Record<string, string>): Promise<Record<string, string>[]> {
  const key = process.env.KRX_API_KEY;
  if (!key) return [];

  try {
    const form = new URLSearchParams({ name: "fileDown", auth: key, bld, ...params });

    const otpRes = await fetch(`${KRX_BASE}/contents/COM/GenerateOTP.cmd`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: form.toString(),
      cache: "no-store",
    });
    if (!otpRes.ok) return [];
    const otp = (await otpRes.text()).trim();
    if (!otp || otp.length < 10) return [];

    const dataRes = await fetch(`${KRX_BASE}/contents/COM/CheckOTP.cmd`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: new URLSearchParams({ code: otp }).toString(),
      cache: "no-store",
    });
    if (!dataRes.ok) return [];

    const json = await dataRes.json() as Record<string, unknown>;
    const data = json.OutBlock_1 ?? json.output ?? json.output2 ?? json.output1 ?? [];
    return Array.isArray(data) ? (data as Record<string, string>[]) : [];
  } catch {
    return [];
  }
}

const parseNum = (s: string | undefined): number => {
  if (!s) return 0;
  return parseFloat(s.replace(/[,+\s]/g, "")) || 0;
};

const parseNullNum = (s: string | undefined): number | null => {
  if (!s || s.trim() === "-" || s.trim() === "") return null;
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? null : n;
};

// ─── 1. 전체 시장 주가 시세 ───────────────────────────────────────────────────

export interface KrxStockPrice {
  code: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  sector: string;
  close: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  tradingValue: number; // 억원
  marketCap: number;    // 억원
  shares: number;
}

export async function getKrxAllPrices(mktId: "STK" | "KSQ", date?: string): Promise<KrxStockPrice[]> {
  const trdDd = date ?? recentTradingDay();
  const rows = await krxRequest("dbms/MDC/STAT/standard/MDCSTAT01501", { trdDd, mktId });

  return rows
    .filter(r => r.ISU_SRT_CD && r.ISU_SRT_CD.match(/^\d/))
    .map(r => ({
      code: r.ISU_SRT_CD,
      name: r.ISU_NM ?? "",
      market: mktId === "STK" ? "KOSPI" : "KOSDAQ",
      sector: r.SECT_TP_NM ?? "",
      close: parseNum(r.TDD_CLSPRC),
      change: parseNum(r.CMPPREVDD_PRC),
      changePct: parseNum(r.FLUC_RT),
      open: parseNum(r.TDD_OPNPRC),
      high: parseNum(r.TDD_HGPRC),
      low: parseNum(r.TDD_LWPRC),
      volume: parseNum(r.ACC_TRDVOL),
      tradingValue: Math.round(parseNum(r.ACC_TRDVAL) / 1_0000), // 원 → 억원
      marketCap: Math.round(parseNum(r.MKTCAP) / 1_0000),
      shares: parseNum(r.LIST_SHRS),
    }));
}

// ─── 2. PER/PBR/배당수익률 ───────────────────────────────────────────────────

export interface KrxValuation {
  code: string;
  name: string;
  eps: number | null;
  bps: number | null;
  per: number | null;
  pbr: number | null;
  divYield: number | null;
  divPerShare: number | null;
}

export async function getKrxValuations(mktId: "STK" | "KSQ", date?: string): Promise<KrxValuation[]> {
  const trdDd = date ?? recentTradingDay();
  const rows = await krxRequest("dbms/MDC/STAT/standard/MDCSTAT03901", { trdDd, mktId });

  return rows
    .filter(r => r.ISU_SRT_CD && r.ISU_SRT_CD.match(/^\d/))
    .map(r => ({
      code: r.ISU_SRT_CD,
      name: r.ISU_NM ?? "",
      eps: parseNullNum(r.EPS),
      bps: parseNullNum(r.BPS),
      per: parseNullNum(r.PER),
      pbr: parseNullNum(r.PBR),
      divYield: parseNullNum(r.DIV_YLD),
      divPerShare: parseNullNum(r.DPS),
    }));
}

// ─── 3. 개별 종목 PER/PBR (단일 종목) ────────────────────────────────────────

export async function getKrxStockValuation(stockCode: string): Promise<KrxValuation | null> {
  // KOSPI 먼저 시도, 없으면 KOSDAQ
  for (const mktId of ["STK", "KSQ"] as const) {
    const list = await getKrxValuations(mktId);
    const found = list.find(v => v.code === stockCode);
    if (found) return found;
  }
  return null;
}

// ─── 4. 투자자별 거래동향 (시장 전체, 당일) ──────────────────────────────────

export interface KrxMarketInvestor {
  date: string;           // YYYY-MM-DD
  market: string;
  foreign: number;        // 외국인 순매수 (백만원)
  institution: number;    // 기관합계 순매수 (백만원)
  individual: number;     // 개인 순매수 (백만원)
  foreignPct: number;     // 외국인 순매수 비율 (%)
}

export async function getKrxMarketInvestors(mktId: "STK" | "KSQ", date?: string): Promise<KrxMarketInvestor | null> {
  const trdDd = date ?? recentTradingDay();
  const rows = await krxRequest("dbms/MDC/STAT/standard/MDCSTAT03901", { trdDd, mktId });
  if (!rows.length) return null;

  // MDCSTAT03901은 시장 요약을 포함 - 별도로 투자자 요약 엔드포인트 사용
  return null;
}

// ─── 5. 개별 종목 투자자별 매매동향 (기간별) ──────────────────────────────────

export interface KrxStockInvestorDay {
  date: string;
  foreign: number;       // 외국인 순매수금액 (백만원)
  institution: number;   // 기관 순매수금액 (백만원)
  individual: number;    // 개인 순매수금액 (백만원)
  foreignVol: number;    // 외국인 순매수수량
  institutionVol: number;
  individualVol: number;
}

export async function getKrxStockInvestors(
  stockCode: string,
  days = 30
): Promise<KrxStockInvestorDay[]> {
  const now = new Date();
  now.setTime(now.getTime() + 9 * 60 * 60 * 1000); // KST
  const endDate = formatKrxDate(now);
  const startD = new Date(now);
  startD.setDate(startD.getDate() - days * 2); // 주말/공휴일 여유
  const startDate = formatKrxDate(startD);

  // ISIN 시도 1: KR7{code}003 (KOSPI 일반주)
  // ISIN 시도 2: KR7{code}006 (KOSDAQ 일반주)
  // fallback: 6자리 코드 직접
  const isinCandidates = [`KR7${stockCode}003`, `KR7${stockCode}006`, stockCode];

  let rows: Record<string, string>[] = [];
  for (const isin of isinCandidates) {
    rows = await krxRequest("dbms/MDC/STAT/standard/MDCSTAT09052", {
      isuCd: isin,
      strtDd: startDate,
      endDd: endDate,
    });
    if (rows.length > 0) break;
  }

  if (!rows.length) return [];

  // 날짜별 투자자 타입별로 집계
  const byDate = new Map<string, KrxStockInvestorDay>();

  for (const r of rows) {
    const rawDate = r.TRD_DD ?? r.TRD_D ?? "";
    if (!rawDate) continue;
    // KRX date: "YYYY/MM/DD" or "YYYYMMDD" → normalize to "YYYY-MM-DD"
    const date = rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate.replace(/\//g, "-").slice(0, 10);

    if (!byDate.has(date)) {
      byDate.set(date, { date, foreign: 0, institution: 0, individual: 0, foreignVol: 0, institutionVol: 0, individualVol: 0 });
    }
    const entry = byDate.get(date)!;

    const invstType = (r.INVST_TP_NM ?? r.INVST_TP ?? "").trim();
    const netVal = parseNum(r.NETBID_TRDVAL ?? r.NET_BID_TRDVAL ?? r.NET_TRDVAL ?? "0");
    const netVol = parseNum(r.NETBID_TRDVOL ?? r.NET_BID_TRDVOL ?? r.NET_TRDVOL ?? "0");

    if (invstType.includes("외국인")) {
      entry.foreign = netVal;
      entry.foreignVol = netVol;
    } else if (invstType.includes("기관")) {
      entry.institution = netVal;
      entry.institutionVol = netVol;
    } else if (invstType.includes("개인")) {
      entry.individual = netVal;
      entry.individualVol = netVol;
    }
  }

  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days);
}

// ─── 6. 시장 전체 투자자별 순매수 추이 (기간별) ───────────────────────────────

export interface KrxMarketInvestorDay {
  date: string;
  kospi: { foreign: number; institution: number; individual: number };
  kosdaq: { foreign: number; institution: number; individual: number };
}

export async function getKrxMarketInvestorTrend(days = 20): Promise<KrxMarketInvestorDay[]> {
  const now = new Date();
  now.setTime(now.getTime() + 9 * 60 * 60 * 1000);
  const endDate = formatKrxDate(now);
  const startD = new Date(now);
  startD.setDate(startD.getDate() - days * 2);
  const startDate = formatKrxDate(startD);

  const [kospiRows, kosdaqRows] = await Promise.all([
    krxRequest("dbms/MDC/STAT/standard/MDCSTAT02901", { strtDd: startDate, endDd: endDate, mktId: "STK" }),
    krxRequest("dbms/MDC/STAT/standard/MDCSTAT02901", { strtDd: startDate, endDd: endDate, mktId: "KSQ" }),
  ]);

  const aggregate = (rows: Record<string, string>[], market: "kospi" | "kosdaq") => {
    const byDate = new Map<string, { foreign: number; institution: number; individual: number }>();
    for (const r of rows) {
      const rawDate = r.TRD_DD ?? "";
      if (!rawDate) continue;
      const date = rawDate.length === 8
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
        : rawDate.replace(/\//g, "-").slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, { foreign: 0, institution: 0, individual: 0 });
      const entry = byDate.get(date)!;
      const invstType = (r.INVST_TP_NM ?? "").trim();
      const netVal = parseNum(r.NETBID_TRDVAL ?? "0");
      if (invstType.includes("외국인") && !invstType.includes("기타")) entry.foreign = netVal;
      else if (invstType.includes("기관합계") || invstType === "기관계") entry.institution = netVal;
      else if (invstType.includes("개인")) entry.individual = netVal;
    }
    return byDate;
  };

  const kospiMap = aggregate(kospiRows, "kospi");
  const kosdaqMap = aggregate(kosdaqRows, "kosdaq");

  const allDates = new Set([...kospiMap.keys(), ...kosdaqMap.keys()]);
  const ZERO = { foreign: 0, institution: 0, individual: 0 };

  return Array.from(allDates)
    .sort()
    .slice(-days)
    .map(date => ({
      date,
      kospi:  kospiMap.get(date)  ?? ZERO,
      kosdaq: kosdaqMap.get(date) ?? ZERO,
    }));
}

// ─── 7. 외국인/기관 순매수 상위 종목 ─────────────────────────────────────────

export interface KrxTopStock {
  code: string;
  name: string;
  netBuyVal: number;  // 순매수금액 (백만원)
  netBuyVol: number;  // 순매수수량
  close: number;
  changePct: number;
}

export async function getKrxTopBuyStocks(
  investorType: "foreign" | "institution",
  mktId: "STK" | "KSQ",
  date?: string
): Promise<KrxTopStock[]> {
  const trdDd = date ?? recentTradingDay();

  // MDCSTAT03501: 투자자별 거래동향 (전종목)
  const rows = await krxRequest("dbms/MDC/STAT/standard/MDCSTAT03501", {
    trdDd,
    mktId,
    invstTpCd: investorType === "foreign" ? "C000" : "9000",
  });

  return rows
    .filter(r => r.ISU_SRT_CD && r.ISU_SRT_CD.match(/^\d/))
    .map(r => ({
      code: r.ISU_SRT_CD,
      name: r.ISU_NM ?? "",
      netBuyVal: parseNum(r.NETBID_TRDVAL ?? "0"),
      netBuyVol: parseNum(r.NETBID_TRDVOL ?? "0"),
      close: parseNum(r.TDD_CLSPRC ?? "0"),
      changePct: parseNum(r.FLUC_RT ?? "0"),
    }))
    .sort((a, b) => b.netBuyVal - a.netBuyVal)
    .slice(0, 20);
}

// ─── 8. 지수 시세 (KOSPI/KOSDAQ 섹터 지수) ───────────────────────────────────

export interface KrxIndexItem {
  indexCode: string;
  indexName: string;
  close: number;
  change: number;
  changePct: number;
  marketCap: number; // 억원
}

export async function getKrxIndices(idxType: "1" | "2" = "1", date?: string): Promise<KrxIndexItem[]> {
  const trdDd = date ?? recentTradingDay();
  const rows = await krxRequest("dbms/MDC/STAT/standard/MDCSTAT11901", {
    trdDd,
    idxIndMktDiv: idxType, // 1: KOSPI, 2: KOSDAQ
  });

  return rows.map(r => ({
    indexCode: r.IDX_IND_CD ?? r.IDX_IND_NM ?? "",
    indexName: r.IDX_IND_NM ?? "",
    close: parseNum(r.CLSPRC_IDX),
    change: parseNum(r.CMPPREVDD_IDX),
    changePct: parseNum(r.FLUC_RT),
    marketCap: Math.round(parseNum(r.MKTCAP) / 1_0000),
  }));
}

// ─── 9. 전체 상장종목 목록 (검색용) ──────────────────────────────────────────

export interface KrxListedStock {
  code: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  sector: string;
  marketCap: number;
}

export async function getKrxListedStocks(mktId: "STK" | "KSQ", date?: string): Promise<KrxListedStock[]> {
  const prices = await getKrxAllPrices(mktId, date);
  return prices.map(p => ({
    code: p.code,
    name: p.name,
    market: p.market,
    sector: p.sector,
    marketCap: p.marketCap,
  }));
}
