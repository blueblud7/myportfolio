/**
 * 관세청 "품목별 국가별 수출입실적" OpenAPI 클라이언트
 *   data.go.kr → 관세청_품목별 국가별 수출입실적(GW)
 *   endpoint: https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList
 *   갱신: 매월 15일경 / 수출금액 단위: USD(달러, FOB)
 *
 * 실측 응답 특성(2026-06 검증):
 *   - 응답은 XML 전용(type=json 줘도 XML). 정규식으로 <item> 파싱.
 *   - 페이지네이션 없음(totalCount/numOfRows 미존재) → 매칭 행 전부 반환.
 *   - hsSgn 4자리를 주면 6자리 세부코드(854231 등) 행으로 펼쳐짐 → 월별 합산 필요.
 *   - cntyCd="" 이면 국가별로 행이 분리됨(statCd=US/CN…) + 기간 "총계" 행 1개.
 *   - 필드: expDlr(수출$) impDlr(수입$) year("2025.03" 또는 "총계") statKor(품목) statCd(국가)
 *
 * 키 발급: https://www.data.go.kr/data/15100475/openapi.do  → .env DATA_GO_KR_KEY
 * 키가 없으면 graceful 하게 null 을 반환한다.
 */

import { getStockCache, setStockCache } from "./stock-cache";

const KEY = process.env.DATA_GO_KR_KEY;
const ENDPOINT = "https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList";

export interface ExportMonth {
  yymm: string;       // "202403"
  expUsd: number;     // 수출금액 (달러)
  impUsd: number;     // 수입금액 (달러)
  /** 전년동월 대비 수출 증감률 (%) — 계산 가능할 때만 */
  expYoY: number | null;
}

export interface ExportTrend {
  hs: string;
  item: string;
  cntyCd: string;     // "" = 전체
  months: ExportMonth[]; // 오름차순(과거→최근)
  latest: ExportMonth | null;
}

function toNum(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** 플랫 XML에서 단일 태그 텍스트 추출 */
function tag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : undefined;
}

interface RawItem {
  year?: string;       // "2025.03" 또는 "총계"
  statKor?: string;    // 품목명
  statCd?: string;     // 국가코드
  expDlr?: string;     // 수출금액(달러)
  impDlr?: string;     // 수입금액(달러)
}

/** 관세청 XML 응답 → item 배열. resultCode 비정상이면 null. */
function parseXml(xml: string): RawItem[] | null {
  const code = tag(xml, "resultCode");
  if (code && code !== "00") return null;
  const items: RawItem[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    items.push({
      year: tag(b, "year"),
      statKor: tag(b, "statKor"),
      statCd: tag(b, "statCd"),
      expDlr: tag(b, "expDlr"),
      impDlr: tag(b, "impDlr"),
    });
  }
  return items;
}

/** YYYYMM 문자열을 n개월 전으로 */
function shiftYymm(yymm: string, deltaMonths: number): string {
  const y = Number(yymm.slice(0, 4));
  const m = Number(yymm.slice(4, 6));
  const total = y * 12 + (m - 1) + deltaMonths;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}${String(nm).padStart(2, "0")}`;
}

/** [start, end] YYYYMM 구간을 최대 12개월(간격 ≤11) 윈도우들로 분할 */
function chunkWindows(start: string, end: string): [string, string][] {
  const out: [string, string][] = [];
  let s = start;
  while (s <= end) {
    let e = shiftYymm(s, 11); // 12개월 윈도우
    if (e > end) e = end;
    out.push([s, e]);
    s = shiftYymm(e, 1);
  }
  return out;
}

/**
 * @param hs     HS부호(4자리 권장)
 * @param months 최근 몇 개월 (기본 24, YoY 계산 위해 +12 더 조회)
 * @param cntyCd 국가코드 ("" = 전체)
 * @param endYymm 종료 연월(YYYYMM). 미지정 시 호출자가 직접 넘겨야 함(서버에서 now 사용 지양)
 */
export async function getExportTrend(
  hs: string,
  endYymm: string,
  months = 24,
  cntyCd = "",
): Promise<ExportTrend | null> {
  if (!KEY) return null;
  if (!/^\d{6}$/.test(endYymm)) return null;

  const cacheKey = `export-trend:${hs}:${cntyCd}:${endYymm}:${months}`;
  const cached = await getStockCache<ExportTrend>(cacheKey);
  if (cached) return cached;

  // YoY 계산 위해 12개월 더 과거부터 조회
  const fetchCount = months + 12;
  const startYymm = shiftYymm(endYymm, -(fetchCount - 1));

  try {
    // 관세청 API는 조회기간 1년(시작~종료 간격 ≤11개월) 이내만 허용 → 12개월씩 분할 호출
    const windows = chunkWindows(startYymm, endYymm);
    const all = await Promise.all(
      windows.map(async ([s, e]) => {
        const params = new URLSearchParams({
          serviceKey: KEY!,
          strtYymm: s,
          endYymm: e,
          hsSgn: hs,
          cntyCd,
        });
        const res = await fetch(`${ENDPOINT}?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) return null;
        return parseXml(await res.text());
      }),
    );
    const items = all.filter((x): x is RawItem[] => x != null).flat();
    if (items.length === 0) return null;

    // 월별 집계 (year 필드가 "총계"/누계인 행은 제외, YYYYMM 형식만)
    const byMonth = new Map<string, { exp: number; imp: number; item: string }>();
    for (const it of items) {
      const ym = String(it.year ?? "").replace(/[^0-9]/g, "");
      if (!/^\d{6}$/.test(ym)) continue;
      const prev = byMonth.get(ym) ?? { exp: 0, imp: 0, item: it.statKor ?? "" };
      prev.exp += toNum(it.expDlr);
      prev.imp += toNum(it.impDlr);
      if (it.statKor) prev.item = it.statKor;
      byMonth.set(ym, prev);
    }
    if (byMonth.size === 0) return null;

    const sorted = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const series: ExportMonth[] = sorted.map(([yymm, v]) => ({
      yymm,
      expUsd: v.exp,
      impUsd: v.imp,
      expYoY: null,
    }));

    // YoY 계산
    const expByYm = new Map(series.map((m) => [m.yymm, m.expUsd]));
    for (const m of series) {
      const prevYear = shiftYymm(m.yymm, -12);
      const base = expByYm.get(prevYear);
      if (base && base > 0) m.expYoY = ((m.expUsd - base) / base) * 100;
    }

    // 최근 months개월만 노출 (YoY 보정용 앞 12개월 잘라냄)
    const visible = series.slice(-months);
    const item = sorted[sorted.length - 1]?.[1].item ?? "";
    const trend: ExportTrend = {
      hs,
      item,
      cntyCd,
      months: visible,
      latest: visible[visible.length - 1] ?? null,
    };

    // 월간 갱신 데이터 → 12시간 캐시
    await setStockCache(cacheKey, trend, 12 * 60 * 60 * 1000);
    return trend;
  } catch {
    return null;
  }
}
