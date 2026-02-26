"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
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

export default function CalculatorPage() {
  const t = useTranslations("Calculator");
  const [initial, setInitial] = useState("100000000");
  const [monthly, setMonthly] = useState("1000000");
  const [years, setYears] = useState("20");
  const [cagr1, setCagr1] = useState("5");
  const [cagr2, setCagr2] = useState("8");
  const [cagr3, setCagr3] = useState("12");

  const PRESETS = [
    { label: t("conservative"), cagr: 5 },
    { label: t("neutral"), cagr: 8 },
    { label: t("aggressive"), cagr: 12 },
    { label: t("sp500"), cagr: 10.5 },
  ];

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
        year: i === 0 ? t("now") : `${i}${t("yearsSuffix")}`,
        scenario1: calc(r1),
        scenario2: calc(r2),
        scenario3: calc(r3),
        invested: Math.round(init + mon * i * 12),
      };
    });
  }, [initial, monthly, years, cagr1, cagr2, cagr3, t]);

  const last = data[data.length - 1];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFormatter = (value: any, name: any) => {
    const labels: Record<string, string> = {
      scenario1: `${cagr1}% ${t("scenarioLabel")}`,
      scenario2: `${cagr2}% ${t("scenarioLabel")}`,
      scenario3: `${cagr3}% ${t("scenarioLabel")}`,
      invested: t("principal"),
    };
    return [`${((value ?? 0) / 1_0000).toFixed(0)}만원`, labels[String(name)] ?? name];
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6" />
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("description")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>{t("initial")}</Label>
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
            <Label>{t("monthly")}</Label>
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
            <Label>{t("years")}</Label>
            <Input
              type="number"
              min="1"
              max="50"
              value={years}
              onChange={(e) => setYears(e.target.value)}
              placeholder="20"
            />
            <p className="text-xs text-muted-foreground">{years}{t("yearsSuffix")} {t("afterYears")}</p>
          </div>
          <div className="space-y-2">
            <Label>{t("presets")}</Label>
            <div className="flex flex-wrap gap-1">
              {[10, 20, 30].map((y) => (
                <Button
                  key={y}
                  size="sm"
                  variant={years === String(y) ? "default" : "outline"}
                  className="text-xs h-7"
                  onClick={() => setYears(String(y))}
                >
                  {y}{t("yearsSuffix")}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
        <CardContent className="border-t pt-4">
          <p className="text-sm font-medium mb-3">{t("scenarios")}</p>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: t("scenario1"), value: cagr1, setter: setCagr1, color: "text-blue-600" },
              { label: t("scenario2"), value: cagr2, setter: setCagr2, color: "text-emerald-600" },
              { label: t("scenario3"), value: cagr3, setter: setCagr3, color: "text-orange-600" },
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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: t("principal"), value: last.invested, color: "text-foreground" },
          { label: `${cagr1}% ${t("scenarioLabel")}`, value: last.scenario1, color: "text-blue-600" },
          { label: `${cagr2}% ${t("scenarioLabel")}`, value: last.scenario2, color: "text-emerald-600" },
          { label: `${cagr3}% ${t("scenarioLabel")}`, value: last.scenario3, color: "text-orange-600" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={`text-xl font-bold mt-1 ${item.color}`}>
                {formatKRW(item.value)}원
              </p>
              {item.value !== last.invested && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("vsInvested")}{" "}
                  <span className="text-emerald-600 font-medium">
                    +{((item.value / last.invested - 1) * 100).toFixed(0)}%
                  </span>
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("growthChart")}</CardTitle>
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
                    scenario1: `${cagr1}% ${t("scenarioLabel")}`,
                    scenario2: `${cagr2}% ${t("scenarioLabel")}`,
                    scenario3: `${cagr3}% ${t("scenarioLabel")}`,
                    invested: t("principal"),
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("forecastTable")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 text-left font-medium">{t("year")}</th>
                <th className="py-2 text-right font-medium">{t("principal")}</th>
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
