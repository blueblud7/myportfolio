"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { RefreshCw, Calculator, TrendingUp, TrendingDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CapitalGainsSummary, CapitalGainsHolding } from "@/types";

const fetcher = (url: string) => fetch(url).then(r => r.json());

const fmtKrw = (v: number) => `₩${Math.round(v).toLocaleString("ko-KR")}`;
const fmtUsd = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "up" | "down" | "warn" | "default" }) {
  const colorClass = accent === "up" ? "text-emerald-400"
    : accent === "down" ? "text-red-400"
    : accent === "warn" ? "text-amber-400"
    : "";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", colorClass)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function HarvestSimulator({ holdings, deductionUsed, exchangeRate }: {
  holdings: CapitalGainsHolding[];
  deductionUsed: number;
  exchangeRate: number;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggle = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sortedHoldings = useMemo(() => {
    return [...holdings].sort((a, b) => a.unrealized_gain_usd - b.unrealized_gain_usd);
  }, [holdings]);

  const selected = useMemo(() => holdings.filter(h => selectedIds.has(h.id)), [holdings, selectedIds]);
  const selectedGainUsd = selected.reduce((s, h) => s + h.unrealized_gain_usd, 0);
  const selectedGainKrw = selectedGainUsd * exchangeRate;

  // 가용 공제 한도 = 250만원 - 기 사용액
  const DEDUCTION_KRW = 2_500_000;
  const remainingDeduction = Math.max(0, DEDUCTION_KRW - deductionUsed);

  // 추가 매도 시 추가 세금
  const newTotalGainKrw = deductionUsed + selectedGainKrw;
  const additionalTaxableKrw = Math.max(0, newTotalGainKrw - DEDUCTION_KRW) - Math.max(0, deductionUsed - DEDUCTION_KRW);
  const additionalTaxKrw = additionalTaxableKrw * 0.22;

  // 손실 종목 자동 선택 (절세 추천)
  const recommendHarvest = () => {
    const losers = holdings.filter(h => h.unrealized_gain_usd < 0).sort((a, b) => a.unrealized_gain_usd - b.unrealized_gain_usd);
    setSelectedIds(new Set(losers.map(l => l.id)));
  };

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">절세 시뮬레이터</span>
        <div className="flex items-center gap-2">
          <button className="btn btn-sm" onClick={recommendHarvest}>
            <Calculator className="h-3.5 w-3.5" />
            손실 종목 전체 선택
          </button>
          {selectedIds.size > 0 && (
            <button className="btn btn-sm" onClick={() => setSelectedIds(new Set())}>
              선택 해제
            </button>
          )}
        </div>
      </div>

      <div className="card-body card-body-padded">
        <div className="rounded-lg bg-muted/30 p-3 mb-3 flex items-start gap-2">
          <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>현재 보유 USD 종목 중 매도할 종목을 선택하면 추가로 발생할 세금이 계산됩니다.</p>
            <p>잔여 공제 한도: <span className="font-mono text-amber-400">{fmtKrw(remainingDeduction)}</span> · 22% 세율 적용</p>
          </div>
        </div>

        {holdings.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">보유 USD 종목이 없습니다.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-xs text-muted-foreground">
                    <th className="px-2 py-2 text-left w-8"></th>
                    <th className="px-2 py-2 text-left">종목</th>
                    <th className="px-2 py-2 text-right">수량</th>
                    <th className="px-2 py-2 text-right">평단가</th>
                    <th className="px-2 py-2 text-right">현재가</th>
                    <th className="px-2 py-2 text-right">평가손익</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHoldings.map(h => {
                    const isProfit = h.unrealized_gain_usd >= 0;
                    const checked = selectedIds.has(h.id);
                    return (
                      <tr
                        key={h.id}
                        className={cn(
                          "border-b border-border/20 cursor-pointer transition-colors",
                          checked ? "bg-accent/10" : "hover:bg-muted/20"
                        )}
                        onClick={() => toggle(h.id)}
                      >
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(h.id)}
                            onClick={e => e.stopPropagation()}
                            className="rounded"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="font-medium">{h.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{h.ticker}</div>
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">{h.quantity.toLocaleString()}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">{fmtUsd(h.avg_cost)}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">{fmtUsd(h.current_price)}</td>
                        <td className={cn("px-2 py-2 text-right font-mono tabular-nums font-semibold", isProfit ? "text-emerald-400" : "text-red-400")}>
                          {isProfit ? "+" : ""}{fmtUsd(h.unrealized_gain_usd)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedIds.size > 0 && (
              <div className="mt-4 rounded-lg border border-accent/40 bg-accent/5 p-4">
                <p className="text-xs font-semibold text-accent mb-3">선택한 {selectedIds.size}개 종목 매도 시</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">실현 손익 (USD)</p>
                    <p className={cn("font-mono text-lg font-bold tabular-nums", selectedGainUsd >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {selectedGainUsd >= 0 ? "+" : ""}{fmtUsd(selectedGainUsd)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">실현 손익 (KRW)</p>
                    <p className={cn("font-mono text-lg font-bold tabular-nums", selectedGainKrw >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {selectedGainKrw >= 0 ? "+" : ""}{fmtKrw(selectedGainKrw)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">추가 과세 표준</p>
                    <p className="font-mono text-lg font-bold tabular-nums text-amber-400">
                      {fmtKrw(additionalTaxableKrw)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">추가 세금</p>
                    <p className="font-mono text-lg font-bold tabular-nums text-red-400">
                      {fmtKrw(additionalTaxKrw)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function TaxPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data, isLoading, mutate } = useSWR<CapitalGainsSummary>(
    `/api/tax/capital-gains?year=${year}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const years = useMemo(() => {
    return [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];
  }, [currentYear]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gutter)" }}>
      <div className="topbar">
        <div>
          <div className="crumb">포트폴리오</div>
          <h1>양도소득세</h1>
        </div>
        <div className="right">
          <div className="seg seg-sm">
            {years.map(y => (
              <button key={y} className={cn("seg-btn", year === y && "active")} onClick={() => setYear(y)}>
                {y}
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => mutate()} disabled={isLoading}>
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            갱신
          </button>
        </div>
      </div>

      {/* 안내 */}
      <div className="rounded-xl border border-border/40 bg-surface/50 px-4 py-3 text-xs text-muted-foreground">
        <p className="font-medium mb-1 text-foreground">한국 거주자 해외주식 양도소득세 (USD 종목 한정)</p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>연 250만원 기본공제 후 22% 세율 (지방세 포함) — 다음 해 5월 신고</li>
          <li>매도 시점 환율로 KRW 환산하여 손익 계산 / 거래 단위 평단가 기준</li>
          <li>KRW 종목은 (대주주 외) 비과세 — 표시하지 않습니다</li>
        </ul>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/30" />)}
        </div>
      ) : !data ? (
        <p className="py-16 text-center text-muted-foreground">데이터 없음</p>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label={`${year}년 실현 손익`}
              value={`${data.realized_gain_krw >= 0 ? "+" : ""}${fmtKrw(data.realized_gain_krw)}`}
              sub={`${data.realized_gain_usd >= 0 ? "+" : ""}${fmtUsd(data.realized_gain_usd)}`}
              accent={data.realized_gain_krw >= 0 ? "up" : "down"}
            />
            <StatCard
              label="기본공제"
              value={fmtKrw(data.deduction_krw)}
              sub="연 250만원 한도"
              accent="default"
            />
            <StatCard
              label="과세 표준"
              value={fmtKrw(data.taxable_krw)}
              sub={data.taxable_krw === 0 ? "공제 한도 내" : "공제 후"}
              accent={data.taxable_krw > 0 ? "warn" : "default"}
            />
            <StatCard
              label="예상 납부세액"
              value={fmtKrw(data.tax_krw)}
              sub="22% (지방세 포함)"
              accent={data.tax_krw > 0 ? "down" : "default"}
            />
          </div>

          {/* 매도 거래 내역 */}
          <div className="card">
            <div className="card-head">
              <span className="card-title">매도 거래 내역</span>
              <span className="text-xs text-muted-foreground">{data.transactions.length}건 · 환율 ₩{data.exchange_rate.toFixed(2)}</span>
            </div>
            <div className="card-body">
              {data.transactions.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {year}년 USD 종목 매도 내역이 없습니다.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40 text-xs text-muted-foreground">
                        <th className="px-3 py-2 text-left">날짜</th>
                        <th className="px-3 py-2 text-left">종목</th>
                        <th className="px-3 py-2 text-right">수량</th>
                        <th className="px-3 py-2 text-right">매도가</th>
                        <th className="px-3 py-2 text-right">평단가</th>
                        <th className="px-3 py-2 text-right">실현 손익 (USD)</th>
                        <th className="px-3 py-2 text-right">실현 손익 (KRW)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.transactions.map((tx, i) => {
                        const isProfit = tx.realized_gain_usd >= 0;
                        return (
                          <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{tx.date}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium">{tx.name}</div>
                              <div className="text-xs text-muted-foreground font-mono">{tx.ticker}</div>
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">{tx.quantity.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtUsd(tx.sell_price)}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{fmtUsd(tx.avg_cost)}</td>
                            <td className={cn("px-3 py-2 text-right font-mono tabular-nums font-semibold", isProfit ? "text-emerald-400" : "text-red-400")}>
                              {isProfit ? "+" : ""}{fmtUsd(tx.realized_gain_usd)}
                            </td>
                            <td className={cn("px-3 py-2 text-right font-mono tabular-nums font-semibold", isProfit ? "text-emerald-400" : "text-red-400")}>
                              {isProfit ? <TrendingUp className="inline h-3 w-3 mr-1" /> : <TrendingDown className="inline h-3 w-3 mr-1" />}
                              {isProfit ? "+" : ""}{fmtKrw(tx.realized_gain_krw)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* 절세 시뮬레이터 */}
          {data.usd_holdings.length > 0 && year === currentYear && (
            <HarvestSimulator
              holdings={data.usd_holdings}
              deductionUsed={data.realized_gain_krw}
              exchangeRate={data.exchange_rate}
            />
          )}
        </>
      )}
    </div>
  );
}
