"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, TrendingDown, Pencil, Check, X, RefreshCw, Calendar, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectorFlowResponse, SectorItem } from "@/app/api/sector-flow/route";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GoalData {
  goals: { id: number; year: number; return_target_pct: number; note: string | null }[];
  currentGoal: { year: number; return_target_pct: number; note: string | null } | null;
  ytd: { startValue: number | null; currentValue: number | null; returnPct: number | null };
  daysLeft: number;
  daysPassed: number;
  totalDays: number;
  year: number;
}

type Period = "1W" | "1M" | "3M" | "YTD";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function heatColor(pct: number | null): string {
  if (pct === null) return "bg-zinc-800/60 text-zinc-500";
  if (pct >= 8)  return "bg-emerald-500/25 text-emerald-300 border-emerald-500/30";
  if (pct >= 4)  return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
  if (pct >= 1)  return "bg-emerald-500/8  text-emerald-500/80 border-emerald-500/10";
  if (pct >= -1) return "bg-zinc-700/40    text-zinc-400 border-zinc-700/40";
  if (pct >= -4) return "bg-red-500/8      text-red-500/80 border-red-500/10";
  if (pct >= -8) return "bg-red-500/15     text-red-400 border-red-500/20";
  return           "bg-red-500/25     text-red-300 border-red-500/30";
}

function fmt(n: number | null, digits = 2): string {
  if (n === null) return "—";
  const s = n.toFixed(digits);
  return n >= 0 ? `+${s}%` : `${s}%`;
}

// ─── Sector Tile ──────────────────────────────────────────────────────────────

function SectorTile({ item }: { item: SectorItem }) {
  const colorClass = heatColor(item.changePct);
  return (
    <div className={cn("rounded-xl border px-3 py-2.5 transition-colors", colorClass)}>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold leading-tight">{item.name}</p>
          <p className="mt-0.5 text-[10px] opacity-60">{item.ticker}</p>
        </div>
        <span className={cn(
          "shrink-0 text-sm font-bold tabular-nums",
          item.changePct === null ? "text-zinc-500"
          : item.changePct >= 0 ? "" : ""
        )}>
          {fmt(item.changePct)}
        </span>
      </div>
    </div>
  );
}

// ─── Goal Form ────────────────────────────────────────────────────────────────

function GoalForm({
  year,
  initial,
  onSave,
  onCancel,
}: {
  year: number;
  initial: number;
  onSave: (pct: number) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(String(initial || ""));
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-zinc-400">{year}년 목표</span>
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          type="number"
          step="0.1"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="20"
          className="h-8 w-24 text-center tabular-nums"
        />
        <span className="text-sm text-zinc-400">%</span>
      </div>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-400 hover:text-emerald-300"
        onClick={() => { const n = parseFloat(val); if (!isNaN(n)) onSave(n); }}>
        <Check className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-500 hover:text-zinc-300"
        onClick={onCancel}>
        <X className="h-4 w-4" />
      </Button>
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

  const saveGoal = async (pct: number) => {
    const year = goalData?.year ?? new Date().getFullYear();
    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, returnTargetPct: pct }),
    });
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

  // Progress: how far along toward target (clamped to 0–100% display)
  const progressPct =
    targetPct && ytdPct !== null
      ? Math.min(100, Math.max(0, (ytdPct / targetPct) * 100))
      : null;

  // Time progress this year
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
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    isAhead
                      ? "border-emerald-500/40 text-emerald-400"
                      : "border-amber-500/40 text-amber-400"
                  )}
                >
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
                    onClick={deleteGoal}>
                    삭제
                  </Button>
                )}
              </div>
            )}
          </div>

          {editing ? (
            <GoalForm
              year={goalData?.year ?? new Date().getFullYear()}
              initial={targetPct ?? 0}
              onSave={saveGoal}
              onCancel={() => setEditing(false)}
            />
          ) : goal ? (
            <>
              {/* Big numbers */}
              <div className="mb-4 grid grid-cols-3 gap-4">
                <div>
                  <p className="mb-1 text-[11px] text-zinc-500">목표 수익률</p>
                  <p className="text-3xl font-bold text-blue-400 tabular-nums">
                    +{targetPct?.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-[11px] text-zinc-500">현재 YTD 수익률</p>
                  <p className={cn(
                    "text-3xl font-bold tabular-nums",
                    ytdPct === null ? "text-zinc-500"
                    : ytdPct >= 0 ? "text-emerald-400" : "text-red-400"
                  )}>
                    {ytdPct !== null ? fmt(ytdPct, 1) : "—"}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-[11px] text-zinc-500">남은 일수</p>
                  <div className="flex items-end gap-1">
                    <p className="text-3xl font-bold text-zinc-300 tabular-nums">
                      {goalData?.daysLeft ?? "—"}
                    </p>
                    <span className="mb-0.5 text-sm text-zinc-500">일</span>
                  </div>
                </div>
              </div>

              {/* Goal progress bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>목표 달성률 {progressPct !== null ? Math.round(progressPct) : 0}%</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    시간 경과 {timeProgressPct ?? 0}%
                  </span>
                </div>
                <div className="relative h-3 overflow-hidden rounded-full bg-zinc-800">
                  {/* Time progress (background indicator) */}
                  {timeProgressPct !== null && (
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-zinc-600/40"
                      style={{ width: `${timeProgressPct}%` }}
                    />
                  )}
                  {/* Goal progress */}
                  {progressPct !== null && (
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full transition-all duration-700",
                        progressPct >= (timeProgressPct ?? 0)
                          ? "bg-emerald-500"
                          : "bg-amber-500"
                      )}
                      style={{ width: `${progressPct}%` }}
                    />
                  )}
                </div>
                <p className="text-[10px] text-zinc-600">
                  회색: 올해 경과 시간 비율 / 컬러: 목표 대비 달성률
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-zinc-500">
              <Target className="h-10 w-10 opacity-20" />
              <p className="text-sm">아직 올해 목표를 설정하지 않았습니다.</p>
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
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-zinc-500 hover:text-zinc-300"
            onClick={() => loadFlow(period)}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loadingFlow && "animate-spin")} />
          </Button>
        </div>

        {/* Period tabs */}
        <div className="mb-4 flex gap-1 rounded-xl bg-muted/30 p-1 w-fit">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all",
                period === p.id
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
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
            {/* US */}
            <div>
              <div className="mb-2.5 flex items-center gap-2">
                <span className="text-lg">🇺🇸</span>
                <span className="font-semibold">미국 섹터 (S&P SPDR ETF)</span>
                {flowData.us[0]?.changePct !== undefined && (
                  <Badge variant="outline" className={cn(
                    "ml-auto text-xs",
                    (flowData.us[0]?.changePct ?? 0) >= 0
                      ? "border-emerald-500/30 text-emerald-400"
                      : "border-red-500/30 text-red-400"
                  )}>
                    {flowData.us[0]?.changePct !== undefined && (
                      <>
                        {(flowData.us[0].changePct ?? 0) >= 0 ? <TrendingUp className="mr-1 inline h-3 w-3" /> : <TrendingDown className="mr-1 inline h-3 w-3" />}
                        최강: {flowData.us[0].name.split(" ")[0]} {fmt(flowData.us[0].changePct)}
                      </>
                    )}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {flowData.us.map((item) => (
                  <SectorTile key={item.key} item={item} />
                ))}
              </div>
            </div>

            {/* KR */}
            <div>
              <div className="mb-2.5 flex items-center gap-2">
                <span className="text-lg">🇰🇷</span>
                <span className="font-semibold">한국 섹터 (KODEX/TIGER ETF)</span>
                {flowData.kr[0]?.changePct !== undefined && (
                  <Badge variant="outline" className={cn(
                    "ml-auto text-xs",
                    (flowData.kr[0]?.changePct ?? 0) >= 0
                      ? "border-emerald-500/30 text-emerald-400"
                      : "border-red-500/30 text-red-400"
                  )}>
                    {(flowData.kr[0].changePct ?? 0) >= 0 ? <TrendingUp className="mr-1 inline h-3 w-3" /> : <TrendingDown className="mr-1 inline h-3 w-3" />}
                    최강: {flowData.kr[0].name} {fmt(flowData.kr[0].changePct)}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-2">
                {flowData.kr.map((item) => (
                  <SectorTile key={item.key} item={item} />
                ))}
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
