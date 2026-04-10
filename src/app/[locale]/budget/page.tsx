"use client";

import { useState, useEffect, useMemo } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { useExchangeRate } from "@/hooks/use-api";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";

interface ExpenseItem {
  id: number;
  name: string;
  name_en: string;
  amount: number;
  currency: string;
  type: "income" | "expense";
  category: string;
  sort_order: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  housing: "주거",
  food: "식비",
  transportation: "교통",
  healthcare: "의료/보험",
  communication: "통신/구독",
  education: "교육",
  personal: "개인",
  entertainment: "여가/여행",
  savings: "저축/세금",
  misc: "기타",
  income: "수입",
};

const CATEGORY_COLORS: Record<string, string> = {
  housing: "#6366f1",
  food: "#f59e0b",
  transportation: "#10b981",
  healthcare: "#ef4444",
  communication: "#3b82f6",
  education: "#8b5cf6",
  personal: "#ec4899",
  entertainment: "#f97316",
  savings: "#14b8a6",
  misc: "#6b7280",
  income: "#22c55e",
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const EXPENSE_API = "/api/expenses";

function formatUSD(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatKRW(n: number) {
  return Math.round(n).toLocaleString("ko-KR");
}

function EditRow({
  item,
  onSave,
  onCancel,
}: {
  item: Partial<ExpenseItem>;
  onSave: (data: Partial<ExpenseItem>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Partial<ExpenseItem>>(item);
  const set = (k: keyof ExpenseItem, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <tr className="bg-primary/5">
      <td className="px-3 py-2">
        <input
          className="w-full rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={form.name ?? ""}
          onChange={(e) => set("name", e.target.value)}
          placeholder="항목명"
        />
      </td>
      <td className="px-3 py-2">
        <select
          className="w-full rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={form.category ?? "misc"}
          onChange={(e) => set("category", e.target.value)}
        >
          {Object.entries(CATEGORY_LABELS)
            .filter(([k]) => k !== "income")
            .map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          className="w-full rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={form.type ?? "expense"}
          onChange={(e) => set("type", e.target.value as "income" | "expense")}
        >
          <option value="expense">지출</option>
          <option value="income">수입</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          className="w-full rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={form.amount ?? 0}
          onChange={(e) => set("amount", parseFloat(e.target.value) || 0)}
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <button
            onClick={() => onSave(form)}
            className="rounded p-1 text-green-500 hover:bg-green-500/10"
          >
            <Check className="h-4 w-4" />
          </button>
          <button onClick={onCancel} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function BudgetPage() {
  const { data: items, isLoading } = useSWR<ExpenseItem[]>(EXPENSE_API, fetcher, {
    revalidateOnFocus: false,
  });
  const { data: rateData } = useExchangeRate();
  const exchangeRate = rateData?.rate ?? 1350;

  const [editingId, setEditingId] = useState<number | null>(null);
  const [addingType, setAddingType] = useState<"expense" | "income" | null>(null);
  const [locale, setLocale] = useState<"ko" | "en">("ko");

  useEffect(() => {
    const savedLocale = document.cookie.match(/NEXT_LOCALE=([^;]+)/)?.[1] ?? "ko";
    setLocale(savedLocale as "ko" | "en");
  }, []);

  const getName = (item: ExpenseItem) =>
    locale === "en" && item.name_en ? item.name_en : item.name;

  const expenses = useMemo(
    () => (items ?? []).filter((i) => i.type === "expense"),
    [items]
  );
  const incomes = useMemo(
    () => (items ?? []).filter((i) => i.type === "income"),
    [items]
  );

  const totalExpense = useMemo(
    () => expenses.reduce((s, i) => s + i.amount, 0),
    [expenses]
  );
  const totalIncome = useMemo(
    () => incomes.reduce((s, i) => s + i.amount, 0),
    [incomes]
  );
  const net = totalExpense - totalIncome; // positive = out of pocket monthly

  // Chart data: expenses by category (non-zero only)
  const chartData = useMemo(() => {
    const byCategory: Record<string, number> = {};
    for (const item of expenses) {
      if (item.amount > 0) {
        byCategory[item.category] = (byCategory[item.category] ?? 0) + item.amount;
      }
    }
    return Object.entries(byCategory).map(([k, v]) => ({
      name: CATEGORY_LABELS[k] ?? k,
      value: v,
      color: CATEGORY_COLORS[k] ?? "#6b7280",
    }));
  }, [expenses]);

  const handleSave = async (data: Partial<ExpenseItem>) => {
    if (data.id) {
      await fetch(EXPENSE_API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } else {
      await fetch(EXPENSE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    }
    setEditingId(null);
    setAddingType(null);
    globalMutate(EXPENSE_API);
  };

  const handleDelete = async (id: number) => {
    await fetch(EXPENSE_API, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    globalMutate(EXPENSE_API);
  };

  const renderSection = (
    title: string,
    sectionItems: ExpenseItem[],
    type: "expense" | "income",
    total: number
  ) => (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold">
          {title}
          <span className={`ml-2 text-sm font-normal ${type === "income" ? "text-green-500" : "text-red-400"}`}>
            ${formatUSD(total)} / 월
          </span>
        </h2>
        <button
          onClick={() => setAddingType(type)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          추가
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">항목</th>
            <th className="px-3 py-2 text-left font-medium">카테고리</th>
            <th className="px-3 py-2 text-left font-medium w-20">구분</th>
            <th className="px-3 py-2 text-right font-medium w-36">월 금액 (USD)</th>
            <th className="w-16"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sectionItems.map((item) =>
            editingId === item.id ? (
              <EditRow
                key={item.id}
                item={item}
                onSave={handleSave}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <tr key={item.id} className="group hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">{getName(item)}</td>
                <td className="px-3 py-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor: `${CATEGORY_COLORS[item.category]}20`,
                      color: CATEGORY_COLORS[item.category],
                    }}
                  >
                    {CATEGORY_LABELS[item.category] ?? item.category}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {item.type === "income" ? "수입" : "지출"}
                </td>
                <td className={`px-3 py-2 text-right font-mono ${item.amount === 0 ? "text-muted-foreground" : ""}`}>
                  {item.amount === 0 ? "—" : `$${formatUSD(item.amount)}`}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingId(item.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          )}
          {/* Add new row */}
          {addingType === type && (
            <EditRow
              item={{ type, category: type === "income" ? "income" : "misc", currency: "USD", amount: 0 }}
              onSave={handleSave}
              onCancel={() => setAddingType(null)}
            />
          )}
        </tbody>
      </table>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">생활비 분석</h1>
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">생활비 분석</h1>
        <div className="text-sm text-muted-foreground">
          환율: ₩{formatKRW(exchangeRate)} / USD
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">월 총 지출</p>
          <p className="mt-1 text-xl font-bold text-red-400">${formatUSD(totalExpense)}</p>
          <p className="text-xs text-muted-foreground">₩{formatKRW(totalExpense * exchangeRate)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">월 총 수입</p>
          <p className="mt-1 text-xl font-bold text-green-500">${formatUSD(totalIncome)}</p>
          <p className="text-xs text-muted-foreground">₩{formatKRW(totalIncome * exchangeRate)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">월 순 지출 (실부담)</p>
          <p className={`mt-1 text-xl font-bold ${net > 0 ? "text-orange-400" : "text-green-500"}`}>
            ${formatUSD(Math.abs(net))}
          </p>
          <p className="text-xs text-muted-foreground">₩{formatKRW(Math.abs(net) * exchangeRate)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">연간 순 지출</p>
          <p className={`mt-1 text-xl font-bold ${net > 0 ? "text-orange-400" : "text-green-500"}`}>
            ${formatUSD(Math.abs(net) * 12)}
          </p>
          <p className="text-xs text-muted-foreground">₩{formatKRW(Math.abs(net) * 12 * exchangeRate)}</p>
        </div>
      </div>

      {/* Chart + breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold">카테고리별 지출</h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  dataKey="value"
                  nameKey="name"
                  paddingAngle={2}
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [`$${formatUSD(value)}`, ""]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">데이터 없음</p>
          )}

          {/* Category breakdown list */}
          <div className="mt-2 space-y-1.5">
            {chartData
              .sort((a, b) => b.value - a.value)
              .map((d) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-muted-foreground">{d.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">${formatUSD(d.value)}</span>
                    <span className="w-10 text-right text-muted-foreground">
                      {totalExpense > 0 ? ((d.value / totalExpense) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Tables */}
        <div className="space-y-4 lg:col-span-2">
          {renderSection("지출 항목", expenses, "expense", totalExpense)}
          {renderSection("수입 항목", incomes, "income", totalIncome)}

          {/* Yearly summary */}
          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">연간 요약</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">연간 총 지출</span>
                <span className="font-mono font-medium text-red-400">
                  ${formatUSD(totalExpense * 12)}
                  <span className="ml-2 text-xs text-muted-foreground">
                    ₩{formatKRW(totalExpense * 12 * exchangeRate)}
                  </span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">연간 총 수입</span>
                <span className="font-mono font-medium text-green-500">
                  ${formatUSD(totalIncome * 12)}
                  <span className="ml-2 text-xs text-muted-foreground">
                    ₩{formatKRW(totalIncome * 12 * exchangeRate)}
                  </span>
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>{net > 0 ? "연간 순 지출 (실부담)" : "연간 순 잉여"}</span>
                <span className={`font-mono ${net > 0 ? "text-orange-400" : "text-green-500"}`}>
                  ${formatUSD(Math.abs(net) * 12)}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ₩{formatKRW(Math.abs(net) * 12 * exchangeRate)}
                  </span>
                </span>
              </div>
              {totalIncome > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>저축률 (수입 대비)</span>
                  <span className="font-medium text-blue-400">
                    {Math.max(0, ((totalIncome - totalExpense) / totalIncome * 100)).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
