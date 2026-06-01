/**
 * Timezone utility — all server-side "today" calculations use PST/PDT.
 * Uses native Intl (no extra dependencies).
 */
const TZ = "America/Los_Angeles";
const FMT = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }); // en-CA → yyyy-MM-dd

/** Returns today's date string in PST/PDT: "yyyy-MM-dd" */
export function todayPST(): string {
  return FMT.format(new Date());
}

/** Formats any Date to "yyyy-MM-dd" in PST/PDT */
export function formatPST(date: Date): string {
  return FMT.format(date);
}

const KST_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });

/**
 * Returns today's date string in KST (Asia/Seoul): "yyyy-MM-dd".
 * 환율 등 한국 사용자 기준 "오늘"이 중요한 데이터에 사용 (미국 장 데이터는 todayPST 사용).
 */
export function todayKST(): string {
  return KST_FMT.format(new Date());
}
