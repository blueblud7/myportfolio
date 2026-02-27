import useSWR from "swr";
import type { Account, Snapshot, ReportData, BankBalance, DiaryEntry, BenchmarkPoint, DividendScheduleResponse, PerformanceCompareResponse, PerformancePeriod, PerformanceSubjectType, SectorEtfResponse, ReturnsCalendarResponse } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const arrayFetcher = (url: string) => fetch(url).then((r) => r.json()).then((d) => Array.isArray(d) ? d : []);

export function useAccounts() {
  return useSWR<Account[]>("/api/accounts", arrayFetcher);
}

export function useHoldings(accountId?: number) {
  const key = accountId ? `/api/holdings?account_id=${accountId}` : "/api/holdings";
  return useSWR(key, arrayFetcher);
}

export function useExchangeRate() {
  return useSWR<{ rate: number }>("/api/exchange-rate", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
}

export function useSnapshots(start?: string, end?: string) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const key = `/api/snapshots${params.toString() ? `?${params}` : ""}`;
  return useSWR<Snapshot[]>(key, fetcher);
}

export function useReports() {
  return useSWR<ReportData>("/api/reports", fetcher);
}

export function useBankBalances(accountId?: number) {
  const key = accountId
    ? `/api/bank-balances?account_id=${accountId}`
    : "/api/bank-balances";
  return useSWR<BankBalance[]>(key, fetcher);
}

export function useDiary(year?: string, month?: string) {
  const params = new URLSearchParams();
  if (year) params.set("year", year);
  if (month) params.set("month", month);
  const key = `/api/diary${params.toString() ? `?${params}` : ""}`;
  return useSWR<DiaryEntry[]>(key, arrayFetcher);
}

export function useBenchmarks(start?: string, end?: string) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const key = `/api/benchmarks${params.toString() ? `?${params}` : ""}`;
  return useSWR<Record<string, BenchmarkPoint[]>>(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300000,
  });
}

export function useDividendSchedule() {
  return useSWR<DividendScheduleResponse>("/api/dividend-schedule", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300000,
  });
}

export function usePerformanceCompare(params: {
  type: PerformanceSubjectType;
  id?: string;
  period: PerformancePeriod;
  benchmarks: string[];
}) {
  const { type, id, period, benchmarks } = params;
  const query = new URLSearchParams({ type, period });
  if (id) query.set("id", id);
  for (const b of benchmarks) query.append("benchmarks", b);
  const key = `/api/performance-compare?${query}`;
  return useSWR<PerformanceCompareResponse>(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300000,
  });
}

export function useSectorEtf(period: string) {
  return useSWR<SectorEtfResponse>(
    `/api/quant/sector-etf?period=${period}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300000 }
  );
}

export function useReturnsCalendar(symbol: string, years: number) {
  return useSWR<ReturnsCalendarResponse>(
    `/api/quant/returns-calendar?symbol=${encodeURIComponent(symbol)}&years=${years}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300000 }
  );
}

export async function refreshPrices(tickers: string[]) {
  const res = await fetch("/api/prices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickers }),
  });
  return res.json();
}
