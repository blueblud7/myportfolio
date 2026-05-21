"use client";

import { useTranslations } from "next-intl";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { formatKRW } from "@/lib/format";

const COLORS = [
  "var(--accent)",
  "oklch(0.74 0.14 215)",
  "oklch(0.74 0.12 150)",
  "oklch(0.74 0.18 25)",
  "oklch(0.72 0.08 280)",
  "oklch(0.68 0.04 250)",
  "oklch(0.78 0.10 100)",
];

interface AllocationItem { name: string; value: number; }
interface Props { title: string; data: AllocationItem[]; }

export function AllocationChart({ title, data }: Props) {
  const t = useTranslations("Common");

  if (data.length === 0) {
    return (
      <div className="card">
        <div className="card-head"><h3 className="card-title">{title}</h3></div>
        <div className="card-body card-body-padded" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
          <span style={{ color: "var(--fg-4)", fontSize: 13 }}>{t("noData")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head"><h3 className="card-title">{title}</h3></div>
      <div className="card-body card-body-padded">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={2} dataKey="value">
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip
              formatter={(value) => formatKRW(value as number)}
              contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: "var(--fg)" }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "var(--fg-3)" }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
