// KRX (한국거래소) 공식 Open API (Data Marketplace)
// Base URL: https://data-dbg.krx.co.kr/svc/apis/
// 인증: AUTH_KEY 헤더

const KRX_BASE = "https://data-dbg.krx.co.kr/svc/apis";

function formatKrxDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// KST 기준으로 가장 최근 거래일 (주말 제외). KRX는 당일 데이터는 장 마감 후 제공되므로 1일 전부터 시도.
function recentTradingDay(daysBack = 1): string {
  const now = new Date();
  now.setTime(now.getTime() + 9 * 60 * 60 * 1000); // KST
  now.setDate(now.getDate() - daysBack);
  while (now.getDay() === 0 || now.getDay() === 6) now.setDate(now.getDate() - 1);
  return formatKrxDate(now);
}

// 공식 API 호출: GET /svc/apis/{endpoint}?basDd=YYYYMMDD
// 헤더 AUTH_KEY 필수. 시세는 당일 데이터가 없을 수 있어 N일 이전까지 자동 재시도.
async function krxApi(endpoint: string, basDd?: string, retries = 5): Promise<Record<string, string>[]> {
  const key = process.env.KRX_API_KEY;
  if (!key) return [];

  let target = basDd ?? recentTradingDay();
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const url = `${KRX_BASE}/${endpoint}?basDd=${target}`;
      const res = await fetch(url, {
        headers: { AUTH_KEY: key, "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json() as Record<string, unknown>;
        const data = json.OutBlock_1 ?? json.output ?? [];
        if (Array.isArray(data) && data.length > 0) {
          return data as Record<string, string>[];
        }
        // 빈 응답이면 주말/공휴일 → 하루 더 과거로
      }
    } catch { /* fallthrough */ }
    // 다음 영업일 후보 (1일 더 과거)
    const d = new Date(`${target.slice(0,4)}-${target.slice(4,6)}-${target.slice(6,8)}T00:00:00Z`);
    do { d.setDate(d.getDate() - 1); } while (d.getDay() === 0 || d.getDay() === 6);
    target = formatKrxDate(d);
  }
  return [];
}

const parseNum = (s: string | undefined): number => {
  if (!s) return 0;
  return parseFloat(s.replace(/[,+\s]/g, "")) || 0;
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

// stk_bydd_trd는 KOSPI+KOSDAQ를 한번에 반환 → MKT_NM 기준 필터 + 종목코드 정규화
let _allPricesCache: { ts: number; data: KrxStockPrice[] } | null = null;
const ALL_PRICES_TTL = 30 * 60 * 1000; // 30분

async function fetchAllStockPrices(date?: string): Promise<KrxStockPrice[]> {
  if (!date && _allPricesCache && Date.now() - _allPricesCache.ts < ALL_PRICES_TTL) {
    return _allPricesCache.data;
  }
  const rows = await krxApi("sto/stk_bydd_trd", date);
  const result: KrxStockPrice[] = rows
    .filter(r => r.ISU_CD && r.MKT_NM)
    .map(r => {
      // ISU_CD는 ISIN(KR7XXXXXXXXX) 형태 → 6자리 단축코드 추출
      const code = r.ISU_CD.length === 12 && r.ISU_CD.startsWith("KR7")
        ? r.ISU_CD.slice(3, 9)
        : r.ISU_CD;
      const mkt = r.MKT_NM ?? "";
      const market: "KOSPI" | "KOSDAQ" = mkt.includes("KOSDAQ") ? "KOSDAQ" : "KOSPI";
      return {
        code,
        name: r.ISU_NM ?? "",
        market,
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
      };
    })
    .filter(p => /^\d/.test(p.code));
  if (!date) _allPricesCache = { ts: Date.now(), data: result };
  return result;
}

export async function getKrxAllPrices(mktId: "STK" | "KSQ", date?: string): Promise<KrxStockPrice[]> {
  const all = await fetchAllStockPrices(date);
  const target = mktId === "STK" ? "KOSPI" : "KOSDAQ";
  return all.filter(p => p.market === target);
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

// KRX 공식 Open API는 PER/PBR/EPS 데이터를 별도 서비스로 분리, 추가 신청 필요.
// 현재는 시세 서비스만 사용 가능 → 빈 배열 반환 (스크리너에서 "—" 표시)
// 필요 시 사용자가 openapi.krx.co.kr에서 "주식 PER/PBR/배당수익률" 서비스 추가 신청.
export async function getKrxValuations(_mktId: "STK" | "KSQ", _date?: string): Promise<KrxValuation[]> {
  return [];
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

export async function getKrxMarketInvestors(_mktId: "STK" | "KSQ", _date?: string): Promise<KrxMarketInvestor | null> {
  // KRX 공식 API에 투자자 거래동향은 별도 서비스 (현재 미신청)
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
  _stockCode: string,
  _days = 30
): Promise<KrxStockInvestorDay[]> {
  // KRX 공식 API에 투자자별 매매동향은 별도 서비스 (현재 미신청) → 빈 배열
  return [];
}

// ─── 6. 시장 전체 투자자별 순매수 추이 (기간별) ───────────────────────────────

export interface KrxMarketInvestorDay {
  date: string;
  kospi: { foreign: number; institution: number; individual: number };
  kosdaq: { foreign: number; institution: number; individual: number };
}

export async function getKrxMarketInvestorTrend(_days = 20): Promise<KrxMarketInvestorDay[]> {
  // KRX 공식 API에 투자자별 매매동향은 별도 서비스 (현재 미신청) → 빈 배열
  return [];
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
  _investorType: "foreign" | "institution",
  _mktId: "STK" | "KSQ",
  _date?: string
): Promise<KrxTopStock[]> {
  // KRX 공식 API에 투자자별 매매동향은 별도 서비스 (현재 미신청) → 빈 배열
  return [];
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
  // idxType=1 → KOSPI 지수, idxType=2 → KOSDAQ 지수
  // KOSPI는 권한 있음(/idx/kospi_dd_trd), KOSDAQ는 미신청(/idx/kosdaq_dd_trd → 401)
  const endpoint = idxType === "1" ? "idx/kospi_dd_trd" : "idx/kosdaq_dd_trd";
  const rows = await krxApi(endpoint, date);

  return rows.map(r => ({
    indexCode: r.IDX_NM ?? r.IDX_CLSS ?? "",
    indexName: r.IDX_NM ?? "",
    close: parseNum(r.CLSPRC_IDX),
    change: parseNum(r.CMPPREVDD_IDX),
    changePct: parseNum(r.FLUC_RT),
    marketCap: Math.round(parseNum(r.MKTCAP ?? "0") / 1_0000),
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
