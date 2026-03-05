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
