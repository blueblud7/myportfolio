"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { useReturnsCalendar } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const SYMBOLS: { label: string; value: string }[] = [
  { label: "S&P 500", value: "^GSPC" },
  { label: "NASDAQ 100", value: "^NDX" },
  { label: "NASDAQ", value: "^IXIC" },
  { label: "KOSPI", value: "^KS11" },
  { label: "XLK (Tech)", value: "XLK" },
  { label: "XLF (Finance)", value: "XLF" },
  { label: "XLV (Health)", value: "XLV" },
  { label: "XLE (Energy)", value: "XLE" },
  { label: "XLI (Industrial)", value: "XLI" },
  { label: "XLY (Cons. Disc.)", value: "XLY" },
  { label: "XLP (Cons. Staples)", value: "XLP" },
  { label: "XLRE (Real Estate)", value: "XLRE" },
  { label: "XLU (Utilities)", value: "XLU" },
  { label: "XLB (Materials)", value: "XLB" },
  { label: "XLC (Comm.)", value: "XLC" },
];

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const YEARS_OPTIONS = [10, 20, 30];

// 고정 상한(cap)까지 intensity 0→1, sqrt 스케일로 저강도 구분력 향상
// rgba로 다크 테마 호환 + 텍스트는 강도에 따라 명시적 지정
function getCellStyle(pct: number | null, cap = 15): React.CSSProperties {
  if (pct === null) return {};

  const ratio = Math.min(Math.abs(pct) / cap, 1);
  const t = Math.pow(ratio, 0.55); // 약간 sub-linear → 작은 값도 잘 보임
  const opacity = 0.18 + t * 0.77; // 0.18(희미) → 0.95(진함)

  if (pct >= 0) {
    // emerald-500 기반
    return {
      backgroundColor: `rgba(16, 185, 129, ${opacity.toFixed(2)})`,
      color: t > 0.42 ? "#f0fdf4" : "#6ee7b7", // 밝은 에메랄드 계열
    };
  } else {
    // red-500 기반
    return {
      backgroundColor: `rgba(239, 68, 68, ${opacity.toFixed(2)})`,
      color: t > 0.42 ? "#fff1f2" : "#fca5a5", // 밝은 레드 계열
    };
  }
}

function formatPct(v: number | null): string {
  if (v === null) return "";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export function ReturnsCalendar() {
  const t = useTranslations("Quant");
  const [symbol, setSymbol] = useState("^GSPC");
  const [years, setYears] = useState(20);

  const { data, isLoading } = useReturnsCalendar(symbol, years);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t("returnsCalendar")}</CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              {SYMBOLS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <div className="flex rounded-md border overflow-hidden text-sm">
              {YEARS_OPTIONS.map((y) => (
                <button
                  key={y}
                  onClick={() => setYears(y)}
                  className={cn(
                    "px-3 py-1.5 font-medium transition-colors",
                    years === y
                      ? "bg-blue-500 text-white"
                      : "bg-transparent text-muted-foreground hover:bg-muted"
                  )}
                >
                  {y === 10 ? t("years10") : y === 20 ? t("years20") : t("years30")}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            로딩 중...
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            데이터가 없습니다
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="py-2 px-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                    Year
                  </th>
                  {MONTH_LABELS.map((m) => (
                    <th key={m} className="py-2 px-1 text-center font-medium text-muted-foreground">
                      {m}
                    </th>
                  ))}
                  <th className="py-2 px-2 text-center font-medium text-muted-foreground">
                    {t("annual")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.year} className="border-t border-border/30">
                    <td className="py-1.5 px-2 font-medium text-muted-foreground whitespace-nowrap">
                      {row.year}
                    </td>
                    {row.months.map((v, i) => (
                      <td
                        key={i}
                        className="py-1.5 px-1 text-center font-mono"
                        style={getCellStyle(v, 15)}
                      >
                        {v !== null ? formatPct(v) : ""}
                      </td>
                    ))}
                    <td
                      className="py-1.5 px-2 text-center font-mono font-semibold"
                      style={getCellStyle(row.annual, 30)}
                    >
                      {row.annual !== null ? formatPct(row.annual) : ""}
                    </td>
                  </tr>
                ))}

                {/* Average row */}
                <tr className="border-t-2 border-border/60">
                  <td className="py-1.5 px-2 font-semibold text-muted-foreground">
                    {t("average")}
                  </td>
                  {data.average.map((v, i) => (
                    <td
                      key={i}
                      className="py-1.5 px-1 text-center font-mono"
                      style={getCellStyle(v, 15)}
                    >
                      {v !== null ? formatPct(v) : ""}
                    </td>
                  ))}
                  <td
                    className="py-1.5 px-2 text-center font-mono font-semibold rounded-sm"
                    style={getCellStyle(data.avg_annual, 30)}
                  >
                    {data.avg_annual !== null ? formatPct(data.avg_annual) : ""}
                  </td>
                </tr>

                {/* Median row */}
                <tr className="border-t border-border/30">
                  <td className="py-1.5 px-2 font-semibold text-muted-foreground">
                    {t("median")}
                  </td>
                  {data.median.map((v, i) => (
                    <td
                      key={i}
                      className="py-1.5 px-1 text-center font-mono"
                      style={getCellStyle(v, 15)}
                    >
                      {v !== null ? formatPct(v) : ""}
                    </td>
                  ))}
                  <td className="py-1.5 px-2" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
