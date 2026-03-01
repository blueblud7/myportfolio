"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { TrendingUp } from "lucide-react";

interface MoodPattern {
  mood: string;
  diary_count: number;
  buy_count: number;
  sell_count: number;
  avg_buy_amount: number;
  avg_sell_amount: number;
  total_tx_count: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const MOOD_COLORS: Record<string, string> = {
  great: "#10b981",
  good: "#3b82f6",
  neutral: "#94a3b8",
  bad: "#f97316",
  terrible: "#ef4444",
};

export function DiaryPatternAnalysis() {
  const t = useTranslations("Diary");
  const tp = useTranslations("DiaryPattern");
  const { data = [], isLoading } = useSWR<MoodPattern[]>("/api/diary-analysis", fetcher);

  if (isLoading) return null;
  const hasData = data.some((d) => d.diary_count > 0);
  if (!hasData) return null;

  const chartData = data.map((d) => ({
    name: t(d.mood as Parameters<typeof t>[0]),
    moodKey: d.mood,
    [tp("diaryCount")]: d.diary_count,
    [tp("buyCount")]: d.buy_count,
    [tp("sellCount")]: d.sell_count,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          {tp("title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">{tp("description")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={28} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey={tp("diaryCount")} maxBarSize={28}>
              {chartData.map((d) => (
                <Cell key={d.moodKey} fill={MOOD_COLORS[d.moodKey]} fillOpacity={0.35} />
              ))}
            </Bar>
            <Bar dataKey={tp("buyCount")} fill="#10b981" maxBarSize={28} />
            <Bar dataKey={tp("sellCount")} fill="#ef4444" maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>

        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          {data.map((d) => {
            const buyRate = d.diary_count > 0 ? (d.buy_count / d.diary_count) * 100 : 0;
            const sellRate = d.diary_count > 0 ? (d.sell_count / d.diary_count) * 100 : 0;
            return (
              <div key={d.mood} className="rounded-lg border p-2 space-y-1">
                <div
                  className="font-semibold"
                  style={{ color: MOOD_COLORS[d.mood] }}
                >
                  {t(d.mood as Parameters<typeof t>[0])}
                </div>
                <div className="text-muted-foreground">{d.diary_count}{tp("countSuffix")}</div>
                {d.diary_count > 0 && (
                  <>
                    <div className="text-emerald-600">{tp("buyRate")} {buyRate.toFixed(0)}%</div>
                    <div className="text-red-500">{tp("sellRate")} {sellRate.toFixed(0)}%</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
