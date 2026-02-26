/** Yahoo Finance 영문 섹터명 → 한국어 */
export const SECTOR_KO: Record<string, string> = {
  Technology: "기술",
  Financials: "금융",
  "Health Care": "헬스케어",
  Energy: "에너지",
  Materials: "소재",
  Industrials: "산업재",
  Utilities: "유틸리티",
  "Real Estate": "부동산",
  "Consumer Staples": "필수소비재",
  "Consumer Discretionary": "자유소비재",
  "Communication Services": "통신서비스",
  Other: "기타",
};

export function translateSector(sector: string, locale: string): string {
  if (locale === "ko") return SECTOR_KO[sector] ?? sector;
  return sector;
}
