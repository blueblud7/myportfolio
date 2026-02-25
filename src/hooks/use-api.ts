import useSWR from "swr";
import type { Account, Snapshot, ReportData, BankBalance } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useAccounts() {
  return useSWR<Account[]>("/api/accounts", fetcher);
}

export function useHoldings(accountId?: number) {
  const key = accountId ? `/api/holdings?account_id=${accountId}` : "/api/holdings";
  return useSWR(key, fetcher);
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

export async function refreshPrices(tickers: string[]) {
  const res = await fetch("/api/prices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickers }),
  });
  return res.json();
}
