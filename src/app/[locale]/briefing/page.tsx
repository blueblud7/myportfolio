"use client";

import { useCallback, useEffect, useState } from "react";

type Period = "daily" | "weekly" | "monthly";

interface FocusPoint {
  ticker: string;
  name: string;
  rating: string | null;
  targetPrice: number | null;
  thesis: string;
  changeNote: string;
}
interface Digest {
  id: number;
  period: Period;
  date: string;
  content: string;
  focus: FocusPoint[];
  created_at: string;
}

const PERIODS: { key: Period; label: string }[] = [
  { key: "daily", label: "일간" },
  { key: "weekly", label: "주간" },
  { key: "monthly", label: "월간" },
];

// 가벼운 마크다운 렌더러 (insights 페이지와 동일 스타일)
function MarkdownRenderer({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  lines.forEach((line, i) => {
    if (line.startsWith("### ")) elements.push(<h3 key={i} className="mt-4 mb-1 text-base font-semibold">{line.slice(4)}</h3>);
    else if (line.startsWith("## ")) elements.push(<h2 key={i} className="mt-5 mb-2 text-lg font-bold">{line.slice(3)}</h2>);
    else if (line.startsWith("# ")) elements.push(<h1 key={i} className="mt-5 mb-2 text-xl font-bold">{line.slice(2)}</h1>);
    else if (line.startsWith("- ") || line.startsWith("* ")) elements.push(<li key={i} className="ml-4 list-disc text-sm leading-relaxed">{line.slice(2).replace(/\*\*(.*?)\*\*/g, "$1").replace(/`(.*?)`/g, "$1")}</li>);
    else if (line.match(/^\d+\. /)) elements.push(<li key={i} className="ml-4 list-decimal text-sm leading-relaxed">{line.replace(/^\d+\. /, "").replace(/\*\*(.*?)\*\*/g, "$1")}</li>);
    else if (line === "---" || line === "***") elements.push(<hr key={i} className="my-3" style={{ borderColor: "var(--border)" }} />);
    else if (line.trim()) elements.push(<p key={i} className="text-sm leading-relaxed" style={{ color: "var(--fg-2)" }}>{line.replace(/\*\*(.*?)\*\*/g, "$1")}</p>);
    else elements.push(<div key={i} className="h-2" />);
  });
  return <div className="space-y-0.5">{elements}</div>;
}

function fmtDateTime(iso: string): string {
  const s = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
  const d = new Date(s);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function BriefingPage() {
  const [period, setPeriod] = useState<Period>("daily");
  const [digests, setDigests] = useState<Digest[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<"" | "pipeline" | "agent">("");
  const [error, setError] = useState("");

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/digests?period=${p}`);
      const data = await res.json();
      const list: Digest[] = data.digests ?? [];
      setDigests(list);
      setSelectedId(list[0]?.id ?? null);
    } catch {
      setError("불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  const generate = async (agent: boolean) => {
    setGenerating(agent ? "agent" : "pipeline");
    setError("");
    try {
      const res = await fetch("/api/digests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, agent }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "생성 실패"); return; }
      await load(period);
    } catch {
      setError("생성 실패");
    } finally {
      setGenerating("");
    }
  };

  const selected = digests.find((d) => d.id === selectedId) ?? null;
  const changes = selected?.focus.filter((f) => f.changeNote) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gutter)" }}>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <div className="crumb">분석</div>
          <h1>보유종목 브리핑</h1>
        </div>
        <div className="right" style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => generate(false)} disabled={!!generating} style={{ height: 32, fontSize: 13 }}>
            {generating === "pipeline" ? "생성 중…" : "지금 생성"}
          </button>
          <button className="btn btn-primary" onClick={() => generate(true)} disabled={!!generating} style={{ height: 32, fontSize: 13 }} title="DeepSeek 에이전트가 도구를 자율 호출해 더 깊게 분석 (느리고 비용↑)">
            {generating === "agent" ? "에이전트 분석 중…" : "🤖 에이전트 분석"}
          </button>
        </div>
      </div>

      {/* Period tabs */}
      <div className="seg" style={{ alignSelf: "flex-start" }}>
        {PERIODS.map((p) => (
          <button key={p.key} className={`seg-btn${period === p.key ? " active" : ""}`} onClick={() => setPeriod(p.key)}>
            {p.label}
          </button>
        ))}
      </div>

      {error && <div className="card" style={{ padding: 14, color: "var(--down)", fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div className="card" style={{ height: 200, background: "var(--bg-2)" }} />
      ) : digests.length === 0 ? (
        <div className="card" style={{ padding: "40px 24px", textAlign: "center", color: "var(--fg-4)" }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>아직 생성된 {PERIODS.find(p => p.key === period)?.label} 브리핑이 없어요</div>
          <div style={{ fontSize: 12 }}>‘지금 생성’을 누르면 보유종목 뉴스·애널리스트 변화를 모아 브리핑을 만들어 드려요.</div>
        </div>
      ) : (
        <div className="stack-2" style={{ gridTemplateColumns: "1fr 280px" }}>
          {/* Selected digest */}
          <div className="card">
            <div className="card-head">
              <h3 className="card-title">{selected?.date} 브리핑</h3>
              {selected && <span className="pill" style={{ fontSize: 11 }}>{fmtDateTime(selected.created_at)} 생성</span>}
            </div>
            <div className="card-body card-body-padded">
              {/* 주안점 변화 하이라이트 */}
              {changes.length > 0 && (
                <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, background: "var(--accent-bg)", border: "1px solid var(--border-strong)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 8 }}>⚠ 주안점 변화</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {changes.map((f) => (
                      <div key={f.ticker} style={{ fontSize: 13 }}>
                        <span className="ticker" style={{ fontWeight: 600 }}>{f.name}</span>
                        <span style={{ color: "var(--fg-3)", marginLeft: 6 }}>{f.changeNote}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="prose-sm max-w-none">
                <MarkdownRenderer text={selected?.content ?? ""} />
              </div>
            </div>
          </div>

          {/* Past digests list */}
          <div className="card" style={{ alignSelf: "flex-start" }}>
            <div className="card-head"><h3 className="card-title">지난 브리핑</h3></div>
            <div className="card-body" style={{ maxHeight: 480, overflowY: "auto" }}>
              {digests.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "10px 16px",
                    background: d.id === selectedId ? "var(--bg-3)" : "transparent",
                    borderBottom: "1px solid var(--border)", cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: d.id === selectedId ? 600 : 400 }}>{d.date}</div>
                  <div style={{ fontSize: 11, color: "var(--fg-4)" }}>
                    {d.focus.filter((f) => f.changeNote).length > 0
                      ? `변화 ${d.focus.filter((f) => f.changeNote).length}건`
                      : `${d.focus.length}개 종목`}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
