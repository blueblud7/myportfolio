"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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

const PERIOD_KEYS = ["1w", "1m", "3m", "6m", "1y"] as const;
type Period = (typeof PERIOD_KEYS)[number];

function formatVol(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return `${v}`;
}

function sentimentKey(pcr: number | null): { key: "fear" | "decline" | "neutral" | "greed" | null; color: string } {
  if (pcr === null) return { key: null, color: "text-muted-foreground" };
  if (pcr > 1.2) return { key: "fear", color: "text-emerald-500" };
  if (pcr > 0.9) return { key: "decline", color: "text-yellow-500" };
  if (pcr > 0.7) return { key: "neutral", color: "text-blue-400" };
  return { key: "greed", color: "text-red-400" };
}

function PCRCard({ data, t }: { data: PCRData; t: (key: string) => string }) {
  const total = data.callVolume + data.putVolume;
  const putPct = total > 0 ? (data.putVolume / total) * 100 : 50;
  const sent = sentimentKey(data.pcr);

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{data.symbol}</span>
        <span className={cn("text-xs font-medium", sent.color)}>{sent.key ? t(sent.key) : "—"}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className={cn("text-xl sm:text-2xl font-mono font-bold", sent.color)}>
          {data.pcr !== null ? data.pcr.toFixed(2) : "—"}
        </span>
        <span className="pb-0.5 text-[10px] text-muted-foreground">
          {data.basis === "openInterest" ? t("basisOI") : t("basisVolume")}
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
function CustomTooltip({ active, payload, label, vixLabel }: any) {
  if (!active || !payload?.length) return null;
  const estimated = payload[0]?.payload?.estimated;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow space-y-0.5">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value?.toFixed(3)}
        </p>
      ))}
      {estimated && (
        <p className="text-[10px] text-muted-foreground mt-1">{vixLabel}</p>
      )}
    </div>
  );
}

function formatXLabel(date: string, period: Period) {
  // date is MM-DD format
  if (period === "1y" || period === "6m") return date.slice(0, 5); // MM-DD
  return date; // MM-DD
}

export function PutCallRatioWidget() {
  const t = useTranslations("PutCallRatio");
  const [period, setPeriod] = useState<Period>("3m");

  const { data, isLoading, error } = useSWR<PCRResponse>(
    `/api/put-call-ratio?period=${period}`,
    fetcher,
    { refreshInterval: 15 * 60 * 1000, revalidateOnFocus: false, dedupingInterval: 900_000 }
  );

  const chartData = (data?.history ?? []).map((h) => ({
    ...h,
    date: h.date.slice(5), // MM-DD
  }));

  // X축 interval 자동 조정
  const xInterval = Math.max(0, Math.floor(chartData.length / 6) - 1);

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-muted-foreground">
        {t("description")}
      </p>

      {/* 현재 PCR 카드 */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted/40" />)}
        </div>
      ) : error || !data ? (
        <p className="py-2 text-center text-xs text-muted-foreground">{t("noData")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {data.current.map((d) => <PCRCard key={d.symbol} data={d} t={t} />)}
        </div>
      )}

      {/* 기간 선택 탭 */}
      <div className="flex gap-1">
        {PERIOD_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={cn(
              "rounded px-2 py-0.5 text-xs font-medium transition-colors",
              period === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {/* 히스토리 차트 */}
      <div>
        {isLoading ? (
          <div className="h-40 animate-pulse rounded-lg border bg-muted/40" />
        ) : chartData.length === 0 ? (
          <div className="flex h-36 items-center justify-center rounded-lg border bg-muted/20">
            <p className="text-center text-[11px] text-muted-foreground">{t("noHistory")}</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9 }}
                  interval={xInterval}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatXLabel(v, period)}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip vixLabel={t("vixEstimated")} />} />
                <Legend iconType="line" wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                <ReferenceLine y={1.2} stroke="#10b981" strokeDasharray="3 3" strokeWidth={1} />
                <ReferenceLine y={0.7} stroke="#f87171" strokeDasharray="3 3" strokeWidth={1} />
                <Line
                  type="monotone" dataKey="SPY" stroke="#6366f1"
                  strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls
                />
                <Line
                  type="monotone" dataKey="QQQ" stroke="#f59e0b"
                  strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-1 flex items-center justify-between text-[9px] text-muted-foreground px-1">
              <div className="flex gap-3">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 border-t border-dashed border-emerald-500" /> {t("fearLine")}
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 border-t border-dashed border-red-400" /> {t("greedLine")}
                </span>
              </div>
              <span className="text-[9px] text-muted-foreground/60">{t("chartLegend")}</span>
            </div>
          </>
        )}
      </div>

      <p className="text-center text-[10px] text-muted-foreground">
        {t("footer")}
      </p>
    </div>
  );
}
