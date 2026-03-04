"use client";

import useSWR from "swr";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import type { PCRResponse, PCRData } from "@/app/api/put-call-ratio/route";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatVol(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return `${v}`;
}

function sentiment(pcr: number | null): { label: string; color: string } {
  if (pcr === null) return { label: "—", color: "text-muted-foreground" };
  if (pcr > 1.2) return { label: "공포", color: "text-emerald-500" };
  if (pcr > 0.9) return { label: "하락심리", color: "text-yellow-500" };
  if (pcr > 0.7) return { label: "중립", color: "text-blue-400" };
  return { label: "탐욕", color: "text-red-400" };
}

function PCRCard({ data }: { data: PCRData }) {
  const total = data.callVolume + data.putVolume;
  const putPct = total > 0 ? (data.putVolume / total) * 100 : 50;
  const sent = sentiment(data.pcr);

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{data.symbol}</span>
        <span className={cn("text-xs font-medium", sent.color)}>{sent.label}</span>
      </div>

      <div className="flex items-end gap-2">
        <span className={cn("text-2xl font-mono font-bold", sent.color)}>
          {data.pcr !== null ? data.pcr.toFixed(2) : "—"}
        </span>
        <span className="pb-0.5 text-[10px] text-muted-foreground">
          {data.basis === "openInterest" ? "OI 기준" : "거래량"}
        </span>
      </div>

      <div className="space-y-1">
        <div className="flex h-1.5 overflow-hidden rounded-full">
          <div className="bg-red-400 transition-all" style={{ width: `${putPct.toFixed(1)}%` }} />
          <div className="bg-emerald-500 flex-1" />
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow space-y-0.5">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value?.toFixed(3)}
        </p>
      ))}
    </div>
  );
}

export function PutCallRatioWidget() {
  const { data, isLoading, error } = useSWR<PCRResponse>("/api/put-call-ratio", fetcher, {
    refreshInterval: 15 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 900_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted/40" />
          ))}
        </div>
        <div className="h-36 animate-pulse rounded-lg border bg-muted/40" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        풋/콜 데이터를 불러올 수 없습니다.
      </p>
    );
  }

  const { current, history } = data;

  // MM/DD 형식으로 변환
  const chartData = history.map((h) => ({ ...h, date: h.date.slice(5) }));
  const hasHistory = chartData.length > 0;

  return (
    <div className="space-y-3">
      {/* 해석 가이드 */}
      <p className="text-[10px] text-muted-foreground">
        PCR &gt; 1.2 공포(역발상 매수) · &lt; 0.7 탐욕(역발상 매도) · CBOE 지연 데이터
      </p>

      {/* 현재 PCR 카드 */}
      <div className="grid grid-cols-2 gap-2">
        {current.map((d) => (
          <PCRCard key={d.symbol} data={d} />
        ))}
      </div>

      {/* 히스토리 차트 */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
          SPY / QQQ Put/Call Ratio 추이
        </p>
        {hasHistory ? (
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9 }}
                interval={Math.max(0, Math.floor(chartData.length / 5) - 1)}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 9 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                iconType="line"
                wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
              />
              <ReferenceLine y={1.2} stroke="#10b981" strokeDasharray="3 3" strokeWidth={1} />
              <ReferenceLine y={0.7} stroke="#f87171" strokeDasharray="3 3" strokeWidth={1} />
              <Line
                type="monotone"
                dataKey="SPY"
                stroke="#6366f1"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="QQQ"
                stroke="#f59e0b"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-36 items-center justify-center rounded-lg border bg-muted/20">
            <p className="text-center text-[11px] text-muted-foreground">
              데이터 누적 중…<br />
              <span className="text-[10px]">매일 방문 시 자동으로 쌓입니다.</span>
            </p>
          </div>
        )}
        <div className="mt-1 flex justify-center gap-4 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 border-t border-dashed border-emerald-500" /> 공포선 1.2
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 border-t border-dashed border-red-400" /> 탐욕선 0.7
          </span>
        </div>
      </div>

      <p className="text-center text-[10px] text-muted-foreground">
        CBOE 지연 데이터 · 15분 갱신
      </p>
    </div>
  );
}
