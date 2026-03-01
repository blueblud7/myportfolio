"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useRebalancing } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Settings2 } from "lucide-react";
import type { RebalancingAccount } from "@/types";

function fmtKrw(v: number) {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_0000_0000) return `${sign}${(abs / 1_0000_0000).toFixed(1)}억`;
  if (abs >= 1_0000) return `${sign}${(abs / 1_0000).toFixed(0)}만`;
  return `${sign}${abs.toLocaleString()}`;
}

function actionColor(action: string) {
  if (action === "buy") return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
  if (action === "sell") return "bg-red-100 text-red-700 hover:bg-red-100";
  return "bg-gray-100 text-gray-600 hover:bg-gray-100";
}

function diffColor(diff: number) {
  if (diff > 0) return "text-red-500";
  if (diff < 0) return "text-emerald-600";
  return "text-muted-foreground";
}

export function RebalancingDashboard() {
  const t = useTranslations("Rebalancing");
  const [tolerance, setTolerance] = useState(5);
  const [editing, setEditing] = useState(false);
  const [localTargets, setLocalTargets] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const { data, isLoading, mutate } = useRebalancing(tolerance);

  // 편집 시작 시 현재 target_pct를 localTargets에 복사
  const handleEditStart = () => {
    if (!data) return;
    const init: Record<number, string> = {};
    for (const a of data.accounts) init[a.id] = String(a.target_pct);
    setLocalTargets(init);
    setEditing(true);
  };

  const totalLocal = useMemo(() => {
    return Object.values(localTargets).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  }, [localTargets]);

  const handleSave = async () => {
    setSaving(true);
    const updates = Object.entries(localTargets).map(([id, pct]) => ({
      id: Number(id),
      target_pct: parseFloat(pct) || 0,
    }));
    await fetch("/api/rebalancing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    await mutate();
    setSaving(false);
    setEditing(false);
  };

  if (isLoading) {
    return <div className="py-16 text-center text-muted-foreground">{t("loading")}</div>;
  }

  if (!data || data.accounts.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">{t("noAccounts")}</div>
    );
  }

  const chartData = data.accounts.map((a) => ({
    name: a.name,
    current: parseFloat(a.current_pct.toFixed(1)),
    target: a.target_pct,
  }));

  const diffChartData = data.accounts
    .filter((a) => a.target_pct > 0)
    .map((a) => ({
      name: a.name,
      diff: parseFloat(a.diff_pct.toFixed(1)),
    }));

  const alertAccounts = data.accounts.filter((a) => a.action !== "hold" && a.target_pct > 0);

  return (
    <div className="space-y-6">
      {/* 컨트롤 바 */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">{t("tolerance")}</Label>
          <div className="flex items-center gap-1">
            {[3, 5, 10].map((v) => (
              <button
                key={v}
                onClick={() => setTolerance(v)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
                  tolerance === v
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                ±{v}%
              </button>
            ))}
            <div className="flex items-center gap-1 ml-1">
              <span className="text-sm text-muted-foreground">±</span>
              <Input
                type="number"
                min={0}
                max={50}
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
                className="h-7 w-14 text-sm text-center"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        <div className="ml-auto">
          {!editing ? (
            <Button size="sm" variant="outline" onClick={handleEditStart}>
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              {t("editTargets")}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className={cn("text-sm font-mono", Math.abs(totalLocal - 100) > 0.1 ? "text-red-500" : "text-emerald-600")}>
                {t("total")}: {totalLocal.toFixed(1)}%
                {Math.abs(totalLocal - 100) > 0.1 && ` (${t("shouldBe100")})`}
              </span>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>{t("cancel")}</Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || Math.abs(totalLocal - 100) > 0.5}
              >
                {saving ? t("saving") : t("save")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 상태 배너 */}
      {data.total_target_pct === 0 ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-center gap-2">
          <Settings2 className="h-4 w-4 shrink-0" />
          {t("setTargetHint")}
        </div>
      ) : data.needs_rebalancing ? (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {t("needsRebalancing", { count: alertAccounts.length })}
        </div>
      ) : (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {t("balanced", { tolerance })}
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">{t("totalAssets")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono">{fmtKrw(data.total_krw)}원</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {t("exchangeRate")}: ₩{data.exchange_rate.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">{t("totalTargetPct")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-xl font-bold font-mono", Math.abs(data.total_target_pct - 100) < 0.1 ? "text-emerald-600" : "text-orange-500")}>
              {data.total_target_pct.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {Math.abs(data.total_target_pct - 100) < 0.1 ? t("targetOk") : t("targetNot100")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">{t("alertCount")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-xl font-bold font-mono", alertAccounts.length > 0 ? "text-orange-500" : "text-emerald-600")}>
              {alertAccounts.length}개
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {t("toleranceLabel", { tolerance })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 현재 vs 목표 비중 바 차트 */}
      {data.total_target_pct > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("comparisonChart")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={40} />
                <Tooltip formatter={(v) => `${(v as number).toFixed(1)}%`} />
                <Legend />
                <Bar dataKey="current" name={t("currentPct")} fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="target" name={t("targetPct")} fill="#e2e8f0" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 편차 차트 */}
      {diffChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t("diffChart")}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({t("positiveIsSell")})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={diffChartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={40} />
                <Tooltip formatter={(v) => [`${(v as number).toFixed(1)}%`, t("diff")]} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <ReferenceLine y={tolerance} stroke="#f97316" strokeDasharray="4 4" />
                <ReferenceLine y={-tolerance} stroke="#f97316" strokeDasharray="4 4" />
                <Bar
                  dataKey="diff"
                  name={t("diff")}
                  radius={[3, 3, 0, 0]}
                  fill="#6366f1"
                  // 양수=빨강(매도), 음수=초록(매수) — Cell로 처리 불가 시 단색
                />
              </BarChart>
            </ResponsiveContainer>
            <p className="mt-1 text-xs text-muted-foreground text-center">
              — {t("toleranceLine", { tolerance })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 계좌별 상세 테이블 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{t("accountDetail")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("account")}</TableHead>
                  <TableHead className="text-right">{t("currentKrw")}</TableHead>
                  <TableHead className="text-right">{t("currentPct")}</TableHead>
                  <TableHead className="text-right">
                    {editing ? (
                      <span className="text-blue-600">{t("targetPct")} ✎</span>
                    ) : (
                      t("targetPct")
                    )}
                  </TableHead>
                  <TableHead className="text-right">{t("diffPct")}</TableHead>
                  <TableHead className="text-right">{t("actionKrw")}</TableHead>
                  <TableHead>{t("action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.accounts.map((a: RebalancingAccount) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{a.name}</div>
                      <div className="text-xs text-muted-foreground">{a.type === "stock" ? "주식" : "은행"} · {a.currency}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtKrw(a.current_krw)}원
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {a.current_pct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {editing ? (
                        <div className="flex items-center justify-end gap-0.5">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            value={localTargets[a.id] ?? "0"}
                            onChange={(e) =>
                              setLocalTargets((prev) => ({ ...prev, [a.id]: e.target.value }))
                            }
                            className="h-7 w-16 text-right font-mono text-sm"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      ) : (
                        <span className="font-mono text-sm">
                          {a.target_pct > 0 ? `${a.target_pct}%` : <span className="text-muted-foreground">—</span>}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={cn("text-right font-mono text-sm", diffColor(a.diff_pct))}>
                      {a.target_pct > 0
                        ? `${a.diff_pct > 0 ? "+" : ""}${a.diff_pct.toFixed(1)}%`
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {a.target_pct > 0 && a.action !== "hold"
                        ? <span>{fmtKrw(a.action_krw)}원</span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {a.target_pct > 0 ? (
                        <Badge variant="outline" className={actionColor(a.action)}>
                          {t(a.action as "buy" | "sell" | "hold")}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("noTarget")}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 리밸런싱 제안 */}
      {alertAccounts.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              {t("suggestions")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {alertAccounts.map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-sm">
                  <Badge
                    variant="outline"
                    className={cn("mt-0.5 shrink-0", actionColor(a.action))}
                  >
                    {t(a.action as "buy" | "sell" | "hold")}
                  </Badge>
                  <span>
                    <span className="font-semibold">{a.name}</span>
                    {a.action === "sell"
                      ? t("suggestionSell", { amount: fmtKrw(a.action_krw) })
                      : t("suggestionBuy", { amount: fmtKrw(a.action_krw) })}
                    <span className="ml-1 text-muted-foreground text-xs">
                      (현재 {a.current_pct.toFixed(1)}% → 목표 {a.target_pct}%)
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
