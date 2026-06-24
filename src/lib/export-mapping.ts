/**
 * 종목(티커) → 관세청 HS코드 매핑
 *
 * 관세청 수출통계는 "상품(HS코드)" 단위라 종목에 직접 붙지 않는다.
 * 한국 수출주는 대표 품목의 월간 수출 증감이 실적을 1~2개월 선행하므로,
 * 주요 수출주를 대표 HS코드(4자리)에 큐레이션 매핑한다.
 *
 * hs:    관세청 hsSgn (4자리 권장)
 * item:  화면 표기용 품목명
 * focus: 핵심 수출 상대국(선택) — 국가별 흐름을 따로 보여줄 때 사용
 */

export interface ExportMapping {
  hs: string;
  item: string;
  /** 주목할 상대국 (관세청 국가코드는 cntyCd, 라벨은 표기용) */
  focus?: { code: string; label: string }[];
}

const CHINA = { code: "CN", label: "중국" };
const US = { code: "US", label: "미국" };

/** 6자리 한국 종목코드 기준. 미국주는 수출통계 대상이 아니므로 제외. */
export const EXPORT_MAP: Record<string, ExportMapping> = {
  // 반도체 (전자집적회로)
  "005930": { hs: "8542", item: "반도체(집적회로)", focus: [CHINA, US] }, // 삼성전자
  "000660": { hs: "8542", item: "반도체(집적회로)", focus: [CHINA, US] }, // SK하이닉스

  // 자동차
  "005380": { hs: "8703", item: "승용차", focus: [US] }, // 현대차
  "000270": { hs: "8703", item: "승용차", focus: [US] }, // 기아
  "012330": { hs: "8708", item: "자동차부품", focus: [US] }, // 현대모비스

  // 2차전지 (축전지)
  "373220": { hs: "8507", item: "2차전지(축전지)", focus: [US] }, // LG에너지솔루션
  "006400": { hs: "8507", item: "2차전지(축전지)", focus: [US] }, // 삼성SDI
  "247540": { hs: "8507", item: "2차전지(축전지)" }, // 에코프로비엠
  "066970": { hs: "8507", item: "2차전지(축전지)" }, // 엘앤에프

  // 디스플레이 (평판디스플레이 모듈, 2022 HS 8524)
  "034220": { hs: "8524", item: "평판디스플레이" }, // LG디스플레이

  // 석유제품
  "010950": { hs: "2710", item: "석유제품" }, // S-Oil
  "078930": { hs: "2710", item: "석유제품" }, // GS

  // 석유화학 (합성수지)
  "051910": { hs: "3901", item: "합성수지(에틸렌중합체)" }, // LG화학
  "011170": { hs: "3902", item: "합성수지(프로필렌중합체)" }, // 롯데케미칼

  // 철강 (평판압연제품)
  "005490": { hs: "7208", item: "철강(평판압연)", focus: [CHINA] }, // POSCO홀딩스

  // 조선 (선박)
  "329180": { hs: "8901", item: "선박" }, // HD현대중공업
  "042660": { hs: "8901", item: "선박" }, // 한화오션

  // 화장품
  "090430": { hs: "3304", item: "화장품", focus: [CHINA, US] }, // 아모레퍼시픽
  "051900": { hs: "3304", item: "화장품", focus: [CHINA] }, // LG생활건강

  // 바이오의약품
  "207940": { hs: "3002", item: "바이오의약품" }, // 삼성바이오로직스
  "068270": { hs: "3002", item: "바이오의약품" }, // 셀트리온

  // 식품 (면류)
  "003230": { hs: "1902", item: "라면·면류", focus: [US] }, // 삼양식품
  "004370": { hs: "1902", item: "라면·면류" }, // 농심
};

/** 6자리 코드만 추출 (".KS"/".KQ" 접미사 제거) */
function normalizeKoreanCode(ticker: string): string | null {
  const m = ticker.match(/^(\d{6})(?:\.[A-Z]{2})?$/);
  return m ? m[1] : null;
}

export function getExportMapping(ticker: string): ExportMapping | null {
  const code = normalizeKoreanCode(ticker);
  if (!code) return null;
  return EXPORT_MAP[code] ?? null;
}

export function hasExportData(ticker: string): boolean {
  return getExportMapping(ticker) !== null;
}
