"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePrivacy } from "@/contexts/privacy-context";
import { formatKRW, gainLossColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RealizedPnlSummary } from "@/types";

const MASK = "•••••";
const fetcher = (url: string) => fetch(url).then((r) => r.json());

const fmtCur = (v: number, currency: string) =>
  currency === "USD"
    ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : `₩${Math.round(v).toLocaleString("ko-KR")}`;

export function RealizedPnl() {
  const { isPrivate } = usePrivacy();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data, isLoading } = useSWR<RealizedPnlSummary>(
    `/api/realized-pnl?year=${year}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const years = data?.years?.length ? data.years : [currentYear];
  const total = data?.total_krw ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2">
          실현손익
          <span className="text-xs font-normal text-muted-foreground">매도 확정 손익 (원화 환산)</span>
        </CardTitle>
        <div className="flex rounded-md border overflow-hidden text-sm">
          {years.slice(0, 5).map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={cn(
                "px-3 py-1 font-medium transition-colors",
                year === y ? "bg-blue-500 text-white" : "bg-transparent text-muted-foreground hover:bg-muted"
              )}
            >
              {y}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">불러오는 중…</div>
        ) : !data || data.transactions.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            {year}년 매도 확정 내역이 없습니다.
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm text-muted-foreground">{year}년 합계</span>
              <span className={cn("text-2xl font-bold font-mono tabular-nums", gainLossColor(total))}>
                {isPrivate ? MASK : `${total >= 0 ? "+" : ""}${formatKRW(total)}`}
              </span>
              <span className="text-xs text-muted-foreground">
                {Object.entries(data.by_currency)
                  .map(([cur, v]) => `${cur} ${v >= 0 ? "+" : ""}${fmtCur(v, cur)}`)
                  .join(" · ")}
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>종목</TableHead>
                  <TableHead className="text-right">매도횟수</TableHead>
                  <TableHead className="text-right">실현손익</TableHead>
                  <TableHead className="text-right">원화 환산</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.by_ticker.map((t) => (
                  <TableRow key={`${t.ticker}-${t.currency}`}>
                    <TableCell>
                      <div className="font-medium">{t.name || t.ticker}</div>
                      <div className="text-xs text-muted-foreground">{t.ticker}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{t.count}</TableCell>
                    <TableCell className={cn("text-right font-mono", gainLossColor(t.realized))}>
                      {isPrivate ? MASK : `${t.realized >= 0 ? "+" : ""}${fmtCur(t.realized, t.currency)}`}
                    </TableCell>
                    <TableCell className={cn("text-right font-mono font-medium", gainLossColor(t.realized_krw))}>
                      {isPrivate ? MASK : `${t.realized_krw >= 0 ? "+" : ""}${formatKRW(t.realized_krw)}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
