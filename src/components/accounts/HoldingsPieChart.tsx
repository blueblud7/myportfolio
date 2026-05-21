"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { formatKRW } from "@/lib/format";

const COLORS = [
  "oklch(0.62 0.17 250)",
  "oklch(0.72 0.14 160)",
  "oklch(0.72 0.15 30)",
  "oklch(0.70 0.16 320)",
  "oklch(0.68 0.14 90)",
  "oklch(0.72 0.14 200)",
  "oklch(0.66 0.16 0)",
  "oklch(0.68 0.10 270)",
];

interface DataItem { name: string; value: number; }
interface Props { data: DataItem[]; compact?: boolean; }

export function HoldingsPieChart({ data, compact = false }: Props) {
  if (!data || data.length === 0) return null;

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const sorted = [...data].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 7);
  const rest = sorted.slice(7);
  const chartData = rest.length > 0
    ? [...top, { name: "기타", value: rest.reduce((s, d) => s + d.value, 0) }]
    : top;

  if (compact) {
    return (
      <div style={{ width: "100%", height: 110 }}>
        <ResponsiveContainer width="100%" height={110}>
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" innerRadius={28} outerRadius={46} paddingAngle={2} dataKey="value">
              {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip
              formatter={(v) => formatKRW(v as number)}
              contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, width: "100%" }}>
      <div style={{ flexShrink: 0, width: 200, height: 200 }}>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" innerRadius={55} outerRadius={82} paddingAngle={2} dataKey="value">
              {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip
              formatter={(v) => formatKRW(v as number)}
              contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        {chartData.map((d, i) => {
          const pct = (d.value / total) * 100;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "var(--fg-2)" }}>
                {d.name}
              </span>
              <span style={{ fontSize: 12, color: "var(--fg-3)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                {pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
