"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { RefreshCw } from "lucide-react";

function fmt(v: number) {
  if (v >= 1_0000_0000) return `${(v / 1_0000_0000).toFixed(1)}억`;
  if (v >= 1_0000) return `${(v / 1_0000).toFixed(0)}만`;
  return v.toLocaleString();
}

export function DripSimulator() {
  const t = useTranslations("Drip");

  const [initial, setInitial] = useState("100000000");
  const [dividendYield, setDividendYield] = useState("4");
  const [priceGrowth, setpriceGrowth] = useState("7");
  const [divGrowth, setDivGrowth] = useState("3");
  const [years, setYears] = useState("20");

  const data = useMemo(() => {
    const P = parseFloat(initial) || 0;
    const dy = (parseFloat(dividendYield) || 0) / 100;
    const pg = (parseFloat(priceGrowth) || 0) / 100;
    const dg = (parseFloat(divGrowth) || 0) / 100;
    const Y = Math.min(Math.max(parseInt(years) || 20, 1), 50);

    return Array.from({ length: Y + 1 }, (_, i) => {
      // Without DRIP: shares stay constant, price grows
      const priceNow = P * Math.pow(1 + pg, i);
      const divRate = dy * Math.pow(1 + dg, i);
      const divIncome = P * divRate * i; // simplified cumulative dividends (not compounded)

      // With DRIP: dividends reinvested each year
      let dripValue = P;
      for (let y = 0; y < i; y++) {
        const yearDivYield = dy * Math.pow(1 + dg, y);
        dripValue = dripValue * (1 + pg) * (1 + yearDivYield);
      }

      return {
        year: i === 0 ? t("now") : `${i}${t("yearsSuffix")}`,
        [t("withDrip")]: Math.round(dripValue),
        [t("withoutDrip")]: Math.round(priceNow + divIncome),
        [t("noDividend")]: Math.round(priceNow),
      };
    });
  }, [initial, dividendYield, priceGrowth, divGrowth, years, t]);

  const last = data[data.length - 1];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFmt = (value: any) => [`${fmt(value as number)}원`];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            {t("settings")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <div className="space-y-2">
            <Label>{t("initial")}</Label>
            <Input
              type="number"
              value={initial}
              onChange={(e) => setInitial(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{fmt(parseFloat(initial) || 0)}원</p>
          </div>
          <div className="space-y-2">
            <Label>{t("dividendYield")} (%)</Label>
            <Input
              type="number"
              step="0.5"
              value={dividendYield}
              onChange={(e) => setDividendYield(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("priceGrowth")} (%)</Label>
            <Input
              type="number"
              step="0.5"
              value={priceGrowth}
              onChange={(e) => setpriceGrowth(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("divGrowth")} (%)</Label>
            <Input
              type="number"
              step="0.5"
              value={divGrowth}
              onChange={(e) => setDivGrowth(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("years")}</Label>
            <Input
              type="number"
              min="1"
              max="50"
              value={years}
              onChange={(e) => setYears(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t("withDrip"), value: last[t("withDrip")] as number, color: "text-blue-600" },
          { label: t("withoutDrip"), value: last[t("withoutDrip")] as number, color: "text-emerald-600" },
          { label: t("noDividend"), value: last[t("noDividend")] as number, color: "text-muted-foreground" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={`text-xl font-bold mt-1 ${item.color}`}>{fmt(item.value)}원</p>
              {item.value !== (last[t("noDividend")] as number) && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("vsBase")}{" "}
                  <span className="text-emerald-600 font-medium">
                    +{(((item.value / (last[t("noDividend")] as number)) - 1) * 100).toFixed(0)}%
                  </span>
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("chartTitle")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("chartDesc")}</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={data} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} width={72} />
              <Tooltip formatter={tooltipFmt} />
              <Legend />
              <Line dataKey={t("withDrip")} stroke="#3b82f6" dot={false} strokeWidth={2.5} />
              <Line dataKey={t("withoutDrip")} stroke="#10b981" dot={false} strokeWidth={2} strokeDasharray="5 3" />
              <Line dataKey={t("noDividend")} stroke="#94a3b8" dot={false} strokeWidth={1.5} strokeDasharray="3 3" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dripBoostTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("dripBoostDesc", {
              years: years,
              dripVal: `${fmt(last[t("withDrip")] as number)}원`,
              noDripVal: `${fmt(last[t("withoutDrip")] as number)}원`,
              boost: (((last[t("withDrip")] as number) / Math.max(last[t("withoutDrip")] as number, 1) - 1) * 100).toFixed(1),
            })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
