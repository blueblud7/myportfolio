"use client";

import useSWR from "swr";
import { cn } from "@/lib/utils";
import type { PCRData } from "@/app/api/put-call-ratio/route";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatVol(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return `${v}`;
}

function sentiment(pcr: number | null): { label: string; color: string; bg: string } {
  if (pcr === null) return { label: "데이터 없음", color: "text-muted-foreground", bg: "bg-muted" };
  if (pcr > 1.2) return { label: "공포 (과매도)", color: "text-emerald-500", bg: "bg-emerald-500" };
  if (pcr > 0.9) return { label: "하락 심리", color: "text-yellow-500", bg: "bg-yellow-500" };
  if (pcr > 0.7) return { label: "중립", color: "text-blue-400", bg: "bg-blue-400" };
  return { label: "탐욕 (과매수)", color: "text-red-400", bg: "bg-red-400" };
}

function PCRCard({ data }: { data: PCRData }) {
  const total = data.callVolume + data.putVolume;
  const putPct = total > 0 ? (data.putVolume / total) * 100 : 50;
  const callPct = 100 - putPct;
  const sent = sentiment(data.pcr);

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2.5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{data.symbol}</span>
        <span className={cn("text-xs font-medium", sent.color)}>{sent.label}</span>
      </div>

      {/* PCR 수치 */}
      <div className="flex items-end gap-2">
        <span className={cn("text-3xl font-mono font-bold", sent.color)}>
          {data.pcr !== null ? data.pcr.toFixed(2) : "—"}
        </span>
        <span className="pb-1 text-[10px] text-muted-foreground">
          {data.basis === "openInterest" ? "OI 기준" : "거래량 기준"}
        </span>
      </div>

      {/* PUT/CALL 바 */}
      <div className="space-y-1">
        <div className="flex h-2 overflow-hidden rounded-full">
          <div
            className="bg-red-400 transition-all"
            style={{ width: `${putPct.toFixed(1)}%` }}
            title={`PUT ${putPct.toFixed(1)}%`}
          />
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${callPct.toFixed(1)}%` }}
            title={`CALL ${callPct.toFixed(1)}%`}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400 mr-1" />
            PUT {formatVol(data.putVolume)}
          </span>
          <span>
            CALL {formatVol(data.callVolume)}
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 ml-1" />
          </span>
        </div>
      </div>
    </div>
  );
}

export function PutCallRatioWidget() {
  const { data, isLoading, error } = useSWR<PCRData[]>("/api/put-call-ratio", fetcher, {
    refreshInterval: 15 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 900000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
    );
  }

  if (error || !data || !Array.isArray(data)) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        풋/콜 데이터를 불러올 수 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* 해석 가이드 */}
      <p className="text-[10px] text-muted-foreground">
        PCR &gt; 1.2 = 공포(역발상 매수 신호) · PCR &lt; 0.7 = 탐욕(역발상 매도 신호) · 최근 만기 기준
      </p>

      <div className="grid grid-cols-2 gap-3">
        {data.map((d) => (
          <PCRCard key={d.symbol} data={d} />
        ))}
      </div>

      <p className="text-center text-[10px] text-muted-foreground">
        Yahoo Finance 옵션 데이터 · 15분 갱신
      </p>
    </div>
  );
}
