"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, TrendingDown, Pencil, Check, X, RefreshCw, Calendar, Flame, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectorFlowResponse, SectorItem } from "@/app/api/sector-flow/route";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GoalData {
  goals: { id: number; year: number; return_target_pct: number; value_target_usd: number | null; start_value_usd: number | null; note: string | null }[];
  currentGoal: { year: number; return_target_pct: number; value_target_usd: number | null; start_value_usd: number | null; note: string | null } | null;
  ytd: { startKrw: number | null; currentKrw: number | null; startUsd: number | null; currentUsd: number | null; returnPct: number | null };
  exchangeRate: number;
  daysLeft: number;
  daysPassed: number;
  totalDays: number;
  year: number;
}

type Period = "1W" | "1M" | "3M" | "YTD";
type InputMode = "usd" | "pct";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function heatColor(pct: number | null): string {
  if (pct === null) return "bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700";
  if (pct >= 8)  return "bg-emerald-100 dark:bg-emerald-500/30 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-500/40";
  if (pct >= 4)  return "bg-emerald-50  dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30";
  if (pct >= 1)  return "bg-emerald-50  dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20";
  if (pct >= -1) return "bg-zinc-100    dark:bg-zinc-700/50    text-zinc-600   dark:text-zinc-300   border-zinc-200 dark:border-zinc-600/50";
  if (pct >= -4) return "bg-red-50      dark:bg-red-500/10     text-red-600    dark:text-red-400    border-red-200 dark:border-red-500/20";
  if (pct >= -8) return "bg-red-100     dark:bg-red-500/20     text-red-700    dark:text-red-300    border-red-300 dark:border-red-500/30";
  return           "bg-red-100     dark:bg-red-500/30     text-red-800    dark:text-red-200    border-red-300 dark:border-red-500/40";
}

function fmtPct(n: number | null, digits = 1): string {
  if (n === null) return "—";
  return (n >= 0 ? "+" : "") + n.toFixed(digits) + "%";
}

function fmtUsd(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}

// ─── Sector Tile ──────────────────────────────────────────────────────────────

function SectorTile({ item }: { item: SectorItem }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2.5 transition-colors", heatColor(item.changePct))}>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold leading-tight">{item.name}</p>
          <p className="mt-0.5 text-[10px] opacity-60 dark:opacity-75">{item.ticker}</p>
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums">
          {fmtPct(item.changePct)}
        </span>
      </div>
    </div>
  );
}

// ─── Goal Form ────────────────────────────────────────────────────────────────

function GoalForm({
  year,
  initialPct,
  initialUsd,
  initialStartUsd,
  snapshotStartUsd,
  onSave,
  onCancel,
}: {
  year: number;
  initialPct: number;
  initialUsd: number | null;
  initialStartUsd: number | null;
  snapshotStartUsd: number | null;
  onSave: (params: { returnTargetPct?: number; valueTargetUsd?: number; startValueUsd?: number }) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<InputMode>(initialUsd ? "usd" : "pct");
  const [usdVal, setUsdVal] = useState(initialUsd ? (initialUsd / 1_000_000).toFixed(3) : "");
  const [pctVal, setPctVal] = useState(initialPct ? initialPct.toFixed(1) : "");
  // 연초 기준값: 수동입력 > 스냅샷
  const defaultStart = initialStartUsd ?? snapshotStartUsd;
  const [startVal, setStartVal] = useState(defaultStart ? (defaultStart / 1_000_000).toFixed(3) : "");

  const startUsd = parseFloat(startVal) * 1_000_000 || null;
  const usdNum = parseFloat(usdVal) * 1_000_000;
  const pctNum = parseFloat(pctVal);

  const previewPct = mode === "usd" && !isNaN(usdNum) && startUsd
    ? ((usdNum - startUsd) / startUsd) * 100 : null;
  const previewUsd = mode === "pct" && !isNaN(pctNum) && startUsd
    ? startUsd * (1 + pctNum / 100) : null;

  const handleSave = () => {
    const sv = startUsd && startUsd > 0 ? startUsd : undefined;
    if (mode === "usd") {
      if (!isNaN(usdNum) && usdNum > 0) onSave({ valueTargetUsd: usdNum, startValueUsd: sv });
    } else {
      if (!isNaN(pctNum)) onSave({ returnTargetPct: pctNum, startValueUsd: sv });
    }
  };

  return (
    <div className="space-y-3">
      {/* 연초 기준값 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500 w-20 shrink-0">연초 기준값</span>
        <div className="flex items-center gap-1">
          <span className="text-sm text-zinc-400">$</span>
          <Input
            type="number"
            step="0.001"
            value={startVal}
            onChange={(e) => setStartVal(e.target.value)}
            placeholder="1.450"
            className="h-8 w-28 tabular-nums"
          />
          <span className="text-sm text-zinc-400">M</span>
        </div>
        {snapshotStartUsd && (
          <span className="text-[11px] text-zinc-600">
            (스냅샷: {fmtUsd(snapshotStartUsd)} — 다르면 직접 입력)
          </span>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 rounded-lg bg-muted/30 p-0.5 w-fit">
        <button onClick={() => setMode("usd")}
          className={cn("rounded px-3 py-1 text-xs font-medium transition-colors",
            mode === "usd" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground")}>
          목표 금액 ($)
        </button>
        <button onClick={() => setMode("pct")}
          className={cn("rounded px-3 py-1 text-xs font-medium transition-colors",
            mode === "pct" ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground")}>
          목표 수익률 (%)
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {mode === "usd" ? (
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-zinc-400">$</span>
            <Input autoFocus type="number" step="0.001" value={usdVal}
              onChange={(e) => setUsdVal(e.target.value)}
              placeholder="2.200" className="h-8 w-28 tabular-nums" />
            <span className="text-sm text-zinc-400">M</span>
            {previewPct !== null && (
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <ArrowRight className="h-3 w-3" />
                역산: <span className={cn("font-semibold", previewPct >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {fmtPct(previewPct)}
                </span>
                <span className="text-zinc-600">(연초 {fmtUsd(startUsd)} 기준)</span>
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Input autoFocus type="number" step="0.1" value={pctVal}
              onChange={(e) => setPctVal(e.target.value)}
              placeholder="20" className="h-8 w-24 tabular-nums" />
            <span className="text-sm text-zinc-400">%</span>
            {previewUsd !== null && (
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <ArrowRight className="h-3 w-3" />
                목표금액: <span className="font-semibold text-blue-400">{fmtUsd(previewUsd)}</span>
                <span className="text-zinc-600">(연초 {fmtUsd(startUsd)} 기준)</span>
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-400 hover:text-emerald-300"
            onClick={handleSave}>
            <Check className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-500 hover:text-zinc-300"
            onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PERIODS: { id: Period; label: string }[] = [
  { id: "1W",  label: "1주" },
  { id: "1M",  label: "1개월" },
  { id: "3M",  label: "3개월" },
  { id: "YTD", label: "올해" },
];

export default function GoalsPage() {
  const [goalData, setGoalData] = useState<GoalData | null>(null);
  const [flowData, setFlowData] = useState<SectorFlowResponse | null>(null);
  const [period, setPeriod] = useState<Period>("1M");
  const [loadingFlow, setLoadingFlow] = useState(false);
  const [editing, setEditing] = useState(false);

  const loadGoals = useCallback(async () => {
    const res = await fetch("/api/goals");
    setGoalData(await res.json());
  }, []);

  const loadFlow = useCallback(async (p: Period) => {
    setLoadingFlow(true);
    try {
      const res = await fetch(`/api/sector-flow?period=${p}`);
      setFlowData(await res.json());
    } finally {
      setLoadingFlow(false);
    }
  }, []);

  useEffect(() => { loadGoals(); }, [loadGoals]);
  useEffect(() => { loadFlow(period); }, [period, loadFlow]);

  const [saveError, setSaveError] = useState<string | null>(null);

  const saveGoal = async (params: { returnTargetPct?: number; valueTargetUsd?: number; startValueUsd?: number }) => {
    const year = goalData?.year ?? new Date().getFullYear();
    setSaveError(null);
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, ...params }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setSaveError(err.error ?? "저장 실패");
      return;
    }
    setEditing(false);
    loadGoals();
  };

  const deleteGoal = async () => {
    const year = goalData?.year ?? new Date().getFullYear();
    await fetch(`/api/goals?year=${year}`, { method: "DELETE" });
    loadGoals();
  };

  const goal = goalData?.currentGoal;
  const ytd = goalData?.ytd;
  const ytdPct = ytd?.returnPct ?? null;
  const targetPct = goal ? Number(goal.return_target_pct) : null;
  const targetUsd = goal?.value_target_usd ? Number(goal.value_target_usd) : null;
  const startUsd = ytd?.startUsd ?? null;
  const snapshotStartUsd = goalData?.ytd.startUsd ?? null;
  const currentUsd = ytd?.currentUsd ?? null;

  // 목표까지 남은 금액
  const remainingUsd = targetUsd && currentUsd ? targetUsd - currentUsd : null;
  const gainedUsd = startUsd && currentUsd ? currentUsd - startUsd : null;
  const neededUsd = targetUsd && startUsd ? targetUsd - startUsd : null;

  // 목표 달성 진행률 (금액 기준)
  const progressPct =
    neededUsd && gainedUsd !== null && neededUsd > 0
      ? Math.min(100, Math.max(0, (gainedUsd / neededUsd) * 100))
      : targetPct && ytdPct !== null
      ? Math.min(100, Math.max(0, (ytdPct / targetPct) * 100))
      : null;

  const timeProgressPct = goalData
    ? Math.round((goalData.daysPassed / goalData.totalDays) * 100)
    : null;

  const isAhead =
    progressPct !== null && timeProgressPct !== null && progressPct >= timeProgressPct;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20">
          <Target className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">목표 & 섹터 자금 흐름</h1>
          <p className="text-sm text-muted-foreground">연간 수익 목표 추적 + 미국·한국 섹터별 자금 유입 현황</p>
        </div>
      </div>

      {/* ── Annual Goal Card ── */}
      <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-blue-300">{goalData?.year ?? "—"}년 수익 목표</span>
              {goal && (
                <Badge variant="outline" className={cn("text-xs",
                  isAhead ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400")}>
                  {isAhead ? "목표 앞서는 중" : "목표 뒤처지는 중"}
                </Badge>
              )}
            </div>
            {!editing && (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                  onClick={() => setEditing(true)}>
                  <Pencil className="h-3 w-3" />
                  {goal ? "수정" : "목표 설정"}
                </Button>
                {goal && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-zinc-600 hover:text-red-400"
                    onClick={deleteGoal}>삭제</Button>
                )}
              </div>
            )}
          </div>

          {editing ? (
            <>
              <GoalForm
                year={goalData?.year ?? new Date().getFullYear()}
                initialPct={targetPct ?? 0}
                initialUsd={targetUsd}
                initialStartUsd={goal?.start_value_usd ? Number(goal.start_value_usd) : null}
                snapshotStartUsd={snapshotStartUsd}
                onSave={saveGoal}
                onCancel={() => { setEditing(false); setSaveError(null); }}
              />
              {saveError && (
                <p className="mt-2 text-xs text-red-400">{saveError}</p>
              )}
            </>
          ) : goal ? (
            <>
              {/* Big numbers — 4열 */}
              <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="mb-1 text-[11px] text-zinc-500">목표 금액</p>
                  <p className="text-2xl font-bold text-blue-400 tabular-nums">
                    {targetUsd ? fmtUsd(targetUsd) : targetPct !== null && targetPct !== 0 ? fmtPct(targetPct) : "—"}
                  </p>
                  {targetPct !== null && targetPct !== 0
                    ? <p className="mt-0.5 text-xs text-zinc-500">{fmtPct(targetPct)} 수익률</p>
                    : targetUsd !== null
                    ? <p className="mt-0.5 text-xs text-amber-500">수정: 연초값 입력 필요</p>
                    : <p className="mt-0.5 text-xs text-zinc-500">—</p>
                  }
                </div>
                <div>
                  <p className="mb-1 text-[11px] text-zinc-500">현재 평가금액</p>
                  <p className={cn("text-2xl font-bold tabular-nums",
                    currentUsd === null ? "text-zinc-500"
                    : (currentUsd ?? 0) >= (targetUsd ?? Infinity) ? "text-emerald-400" : "text-zinc-200")}>
                    {fmtUsd(currentUsd)}
                  </p>
                  <p className={cn("mt-0.5 text-xs", ytdPct === null ? "text-zinc-500" : ytdPct >= 0 ? "text-emerald-500" : "text-red-500")}>
                    YTD {fmtPct(ytdPct)}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-[11px] text-zinc-500">연초 기준</p>
                  <p className="text-2xl font-bold text-zinc-400 tabular-nums">{fmtUsd(startUsd)}</p>
                  <p className="mt-0.5 text-xs text-zinc-600">올해 시작점</p>
                </div>
                <div>
                  <p className="mb-1 text-[11px] text-zinc-500">남은 금액</p>
                  <p className={cn("text-2xl font-bold tabular-nums",
                    remainingUsd === null ? "text-zinc-500"
                    : remainingUsd <= 0 ? "text-emerald-400" : "text-amber-400")}>
                    {remainingUsd !== null
                      ? remainingUsd <= 0
                        ? "달성 ✓"
                        : fmtUsd(remainingUsd)
                      : "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">{goalData?.daysLeft ?? "—"}일 남음</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>달성률 {progressPct !== null ? Math.round(progressPct) : 0}%
                    {gainedUsd !== null && neededUsd !== null &&
                      <span className="ml-1 text-zinc-600">({fmtUsd(gainedUsd)} / {fmtUsd(neededUsd)})</span>
                    }
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    시간 경과 {timeProgressPct ?? 0}%
                  </span>
                </div>
                <div className="relative h-3 overflow-hidden rounded-full bg-zinc-800">
                  {timeProgressPct !== null && (
                    <div className="absolute inset-y-0 left-0 rounded-full bg-zinc-600/40"
                      style={{ width: `${timeProgressPct}%` }} />
                  )}
                  {progressPct !== null && (
                    <div className={cn("absolute inset-y-0 left-0 rounded-full transition-all duration-700",
                      progressPct >= (timeProgressPct ?? 0) ? "bg-emerald-500" : "bg-amber-500")}
                      style={{ width: `${progressPct}%` }} />
                  )}
                </div>
                <p className="text-[10px] text-zinc-600">
                  회색: 올해 경과 시간 / 컬러: 목표 대비 달성률 (환율 {goalData?.exchangeRate?.toLocaleString()}원/달러 기준)
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-zinc-500">
              <Target className="h-10 w-10 opacity-20" />
              <p className="text-sm">아직 올해 목표를 설정하지 않았습니다.</p>
              <p className="text-xs text-zinc-600">목표 금액($) 또는 목표 수익률(%)로 입력할 수 있습니다.</p>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="mt-1">
                목표 설정하기
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Sector Flow ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-400" />
            <span className="font-semibold">섹터별 자금 흐름</span>
            <span className="text-xs text-zinc-500">— 기간별 등락률 (수익률 ≈ 자금 유입 프록시)</span>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-zinc-500 hover:text-zinc-300"
            onClick={() => loadFlow(period)}>
            <RefreshCw className={cn("h-3.5 w-3.5", loadingFlow && "animate-spin")} />
          </Button>
        </div>

        {/* Period tabs */}
        <div className="mb-4 flex gap-1 rounded-xl bg-muted/30 p-1 w-fit">
          {PERIODS.map((p) => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={cn("rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all",
                period === p.id ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {p.label}
            </button>
          ))}
        </div>

        {loadingFlow && !flowData && (
          <div className="flex items-center justify-center gap-2 py-16 text-zinc-500">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span className="text-sm">섹터 데이터 로딩 중...</span>
          </div>
        )}

        {flowData && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-2.5 flex items-center gap-2">
                <span className="text-lg">🇺🇸</span>
                <span className="font-semibold">미국 섹터 (S&P SPDR ETF)</span>
                {flowData.us[0] && (
                  <Badge variant="outline" className={cn("ml-auto text-xs",
                    (flowData.us[0].changePct ?? 0) >= 0 ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400")}>
                    {(flowData.us[0].changePct ?? 0) >= 0
                      ? <TrendingUp className="mr-1 inline h-3 w-3" />
                      : <TrendingDown className="mr-1 inline h-3 w-3" />}
                    최강: {flowData.us[0].name.split(" ")[0]} {fmtPct(flowData.us[0].changePct)}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {flowData.us.map((item) => <SectorTile key={item.key} item={item} />)}
              </div>
            </div>

            <div>
              <div className="mb-2.5 flex items-center gap-2">
                <span className="text-lg">🇰🇷</span>
                <span className="font-semibold">한국 섹터 (KODEX/TIGER ETF)</span>
                {flowData.kr[0] && (
                  <Badge variant="outline" className={cn("ml-auto text-xs",
                    (flowData.kr[0].changePct ?? 0) >= 0 ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400")}>
                    {(flowData.kr[0].changePct ?? 0) >= 0
                      ? <TrendingUp className="mr-1 inline h-3 w-3" />
                      : <TrendingDown className="mr-1 inline h-3 w-3" />}
                    최강: {flowData.kr[0].name} {fmtPct(flowData.kr[0].changePct)}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-2">
                {flowData.kr.map((item) => <SectorTile key={item.key} item={item} />)}
              </div>
            </div>
          </div>
        )}

        {flowData && (
          <p className="mt-4 text-[11px] text-zinc-600">
            * 섹터 ETF 기간 수익률 기준 (실제 자금 유입/유출은 ETF AUM 변화로 측정해야 하나, 수익률이 강한 프록시입니다). 30분 캐시.
          </p>
        )}
      </div>
    </div>
  );
}
