"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";

function formatKRW(value: number) {
  if (value >= 1_0000_0000) {
    return `${(value / 1_0000_0000).toFixed(1)}억`;
  }
  if (value >= 1_0000) {
    return `${(value / 1_0000).toFixed(0)}만`;
  }
  return value.toLocaleString();
}

const PRESETS = [
  { label: "보수적 (5%)", cagr: 5 },
  { label: "중립 (8%)", cagr: 8 },
  { label: "공격적 (12%)", cagr: 12 },
  { label: "S&P500 역사 (10.5%)", cagr: 10.5 },
];

export default function CalculatorPage() {
  const [initial, setInitial] = useState("100000000");
  const [monthly, setMonthly] = useState("1000000");
  const [years, setYears] = useState("20");
  const [cagr1, setCagr1] = useState("5");
  const [cagr2, setCagr2] = useState("8");
  const [cagr3, setCagr3] = useState("12");

  const data = useMemo(() => {
    const init = parseFloat(initial) || 0;
    const mon = parseFloat(monthly) || 0;
    const y = Math.min(Math.max(parseInt(years) || 20, 1), 50);
    const r1 = (parseFloat(cagr1) || 0) / 100;
    const r2 = (parseFloat(cagr2) || 0) / 100;
    const r3 = (parseFloat(cagr3) || 0) / 100;

    return Array.from({ length: y + 1 }, (_, i) => {
      const calc = (rate: number) => {
        const principal = init * Math.pow(1 + rate, i);
        const monthlyRate = rate / 12;
        const months = i * 12;
        const monthlySeries =
          monthlyRate > 0
            ? mon * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate)
            : mon * months;
        return Math.round(principal + monthlySeries);
      };

      return {
        year: i === 0 ? "현재" : `${i}년`,
        scenario1: calc(r1),
        scenario2: calc(r2),
        scenario3: calc(r3),
        invested: Math.round(init + mon * i * 12),
      };
    });
  }, [initial, monthly, years, cagr1, cagr2, cagr3]);

  const last = data[data.length - 1];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFormatter = (value: any, name: any) => {
    const labels: Record<string, string> = {
      scenario1: `${cagr1}% 시나리오`,
      scenario2: `${cagr2}% 시나리오`,
      scenario3: `${cagr3}% 시나리오`,
      invested: "투자 원금",
    };
    return [`${((value ?? 0) / 1_0000).toFixed(0)}만원`, labels[String(name)] ?? name];
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6" />
          미래 자산 예측
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          복리 수익률을 기반으로 미래 자산을 시뮬레이션합니다.
        </p>
      </div>

      {/* 입력 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">시뮬레이션 설정</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>초기 자산 (원)</Label>
            <Input
              type="number"
              value={initial}
              onChange={(e) => setInitial(e.target.value)}
              placeholder="100000000"
            />
            <p className="text-xs text-muted-foreground">
              {formatKRW(parseFloat(initial) || 0)}원
            </p>
          </div>
          <div className="space-y-2">
            <Label>월 적립금 (원)</Label>
            <Input
              type="number"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
              placeholder="1000000"
            />
            <p className="text-xs text-muted-foreground">
              {formatKRW(parseFloat(monthly) || 0)}원/월
            </p>
          </div>
          <div className="space-y-2">
            <Label>투자 기간 (년)</Label>
            <Input
              type="number"
              min="1"
              max="50"
              value={years}
              onChange={(e) => setYears(e.target.value)}
              placeholder="20"
            />
            <p className="text-xs text-muted-foreground">{years}년 후</p>
          </div>
          <div className="space-y-2">
            <Label>기간 프리셋</Label>
            <div className="flex flex-wrap gap-1">
              {[10, 20, 30].map((y) => (
                <Button
                  key={y}
                  size="sm"
                  variant={years === String(y) ? "default" : "outline"}
                  className="text-xs h-7"
                  onClick={() => setYears(String(y))}
                >
                  {y}년
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
        <CardContent className="border-t pt-4">
          <p className="text-sm font-medium mb-3">수익률 시나리오 (%/년)</p>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "시나리오 1", value: cagr1, setter: setCagr1, color: "text-blue-600" },
              { label: "시나리오 2", value: cagr2, setter: setCagr2, color: "text-emerald-600" },
              { label: "시나리오 3", value: cagr3, setter: setCagr3, color: "text-orange-600" },
            ].map((s) => (
              <div key={s.label} className="space-y-2">
                <Label className={s.color}>{s.label}</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={s.value}
                  onChange={(e) => s.setter(e.target.value)}
                />
                <div className="flex flex-wrap gap-1">
                  {PRESETS.map((p) => (
                    <Button
                      key={p.label}
                      size="sm"
                      variant="ghost"
                      className="text-[10px] h-6 px-1.5"
                      onClick={() => s.setter(String(p.cagr))}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 결과 요약 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "투자 원금", value: last.invested, color: "text-foreground" },
          { label: `${cagr1}% 시나리오`, value: last.scenario1, color: "text-blue-600" },
          { label: `${cagr2}% 시나리오`, value: last.scenario2, color: "text-emerald-600" },
          { label: `${cagr3}% 시나리오`, value: last.scenario3, color: "text-orange-600" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={`text-xl font-bold mt-1 ${item.color}`}>
                {formatKRW(item.value)}원
              </p>
              {item.value !== last.invested && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  원금 대비{" "}
                  <span className="text-emerald-600 font-medium">
                    +{((item.value / last.invested - 1) * 100).toFixed(0)}%
                  </span>
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 그래프 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">자산 성장 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={data} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis
                tickFormatter={(v) => formatKRW(v)}
                tick={{ fontSize: 11 }}
                width={70}
              />
              <Tooltip formatter={tooltipFormatter} />
              <Legend
                formatter={(value) => {
                  const labels: Record<string, string> = {
                    scenario1: `${cagr1}% 시나리오`,
                    scenario2: `${cagr2}% 시나리오`,
                    scenario3: `${cagr3}% 시나리오`,
                    invested: "투자 원금",
                  };
                  return labels[value] ?? value;
                }}
              />
              <Line dataKey="invested" stroke="#94a3b8" strokeDasharray="5 5" dot={false} strokeWidth={1.5} />
              <Line dataKey="scenario1" stroke="#3b82f6" dot={false} strokeWidth={2} />
              <Line dataKey="scenario2" stroke="#10b981" dot={false} strokeWidth={2} />
              <Line dataKey="scenario3" stroke="#f97316" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 상세 표 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">연도별 자산 예측표</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 text-left font-medium">연도</th>
                <th className="py-2 text-right font-medium">투자 원금</th>
                <th className="py-2 text-right font-medium text-blue-600">{cagr1}%</th>
                <th className="py-2 text-right font-medium text-emerald-600">{cagr2}%</th>
                <th className="py-2 text-right font-medium text-orange-600">{cagr3}%</th>
              </tr>
            </thead>
            <tbody>
              {data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 15)) === 0 || i === data.length - 1).map((row) => (
                <tr key={row.year} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-1.5 font-medium">{row.year}</td>
                  <td className="py-1.5 text-right font-mono text-muted-foreground">{formatKRW(row.invested)}원</td>
                  <td className="py-1.5 text-right font-mono text-blue-600">{formatKRW(row.scenario1)}원</td>
                  <td className="py-1.5 text-right font-mono text-emerald-600">{formatKRW(row.scenario2)}원</td>
                  <td className="py-1.5 text-right font-mono text-orange-600">{formatKRW(row.scenario3)}원</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
