"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PortfolioSummary {
  totalKrw: number;
  totalStockKrw: number;
  totalBankKrw: number;
  totalGainLoss: number;
  holdingsCount: number;
  exchangeRate: number;
}

const QUICK_QUESTIONS = [
  "포트폴리오의 집중 리스크를 분석해줘",
  "리밸런싱이 필요한 종목은?",
  "현재 시장 상황에서 현금 비중은 적절한가?",
  "손실 종목 중 손절 고려가 필요한 것은?",
  "배당 수익 관점에서 개선 방향은?",
];

function MarkdownRenderer({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="mt-4 mb-1 text-base font-semibold">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="mt-5 mb-2 text-lg font-bold">{line.slice(3)}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="mt-5 mb-2 text-xl font-bold">{line.slice(2)}</h1>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <li key={i} className="ml-4 list-disc text-sm leading-relaxed">
          {line.slice(2).replace(/\*\*(.*?)\*\*/g, "").replace(/`(.*?)`/g, "$1")}
        </li>
      );
    } else if (line.match(/^\d+\. /)) {
      elements.push(
        <li key={i} className="ml-4 list-decimal text-sm leading-relaxed">
          {line.replace(/^\d+\. /, "").replace(/\*\*(.*?)\*\*/g, "").replace(/`(.*?)`/g, "$1")}
        </li>
      );
    } else if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(<p key={i} className="mt-2 text-sm font-semibold">{line.slice(2, -2)}</p>);
    } else if (line === "---" || line === "***") {
      elements.push(<hr key={i} className="my-3 border-muted" />);
    } else if (line.trim()) {
      elements.push(
        <p key={i} className="text-sm leading-relaxed text-foreground/90">
          {line.replace(/\*\*(.*?)\*\*/g, "$1")}
        </p>
      );
    } else {
      elements.push(<div key={i} className="h-2" />);
    }
    i++;
  }
  return <div className="space-y-0.5">{elements}</div>;
}

export default function InsightsPage() {
  const [analysis, setAnalysis] = useState<string>("");
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<string>("");

  const fetchInsights = async (q?: string) => {
    setLoading(true);
    setError(null);
    setAnalysis("");
    setAsked(q ?? "종합 분석");
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q ?? "" }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalysis(data.analysis);
      setSummary(data.portfolioSummary);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20">
          <Sparkles className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">AI 포트폴리오 인사이트</h1>
          <p className="text-sm text-muted-foreground">Claude AI가 내 포트폴리오를 분석합니다</p>
        </div>
      </div>

      {/* 분석 요청 카드 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">분석 질문</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 빠른 질문 */}
          <div className="flex flex-wrap gap-2">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => fetchInsights(q)}
                disabled={loading}
                className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-400 transition-colors hover:bg-violet-500/20 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          {/* 직접 입력 */}
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="포트폴리오에 대해 궁금한 점을 물어보세요..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  fetchInsights(question || undefined);
                }
              }}
              disabled={loading}
            />
            <Button
              onClick={() => fetchInsights(question || undefined)}
              disabled={loading}
              className="shrink-0 bg-violet-600 hover:bg-violet-700"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>

          <Button
            variant="outline"
            onClick={() => fetchInsights()}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {loading ? "분석 중..." : "포트폴리오 종합 분석 시작"}
          </Button>
        </CardContent>
      </Card>

      {/* 에러 */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-sm text-destructive">
            {error.includes("OPENAI_API_KEY") || error.includes("authentication") || error.includes("Incorrect API key")
              ? "OPENAI_API_KEY가 설정되지 않았거나 유효하지 않습니다."
              : error}
          </CardContent>
        </Card>
      )}

      {/* 로딩 */}
      {loading && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <Sparkles className="h-10 w-10 animate-pulse text-violet-400" />
              </div>
              <p className="text-sm text-muted-foreground">Claude AI가 포트폴리오를 분석하고 있습니다...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 결과 */}
      {analysis && !loading && (
        <>
          {summary && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="bg-muted/30">
                <CardContent className="py-3 text-center">
                  <p className="text-xs text-muted-foreground">총 자산</p>
                  <p className="font-bold">₩{Math.round(summary.totalKrw / 10000).toLocaleString()}만</p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardContent className="py-3 text-center">
                  <p className="text-xs text-muted-foreground">총 수익률</p>
                  <p className={cn("font-bold", summary.totalGainLoss >= 0 ? "text-emerald-500" : "text-red-500")}>
                    {summary.totalGainLoss >= 0 ? "+" : ""}{summary.totalGainLoss}%
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardContent className="py-3 text-center">
                  <p className="text-xs text-muted-foreground">종목 수</p>
                  <p className="font-bold">{summary.holdingsCount}개</p>
                </CardContent>
              </Card>
              <Card className="bg-muted/30">
                <CardContent className="py-3 text-center">
                  <p className="text-xs text-muted-foreground">현금 비중</p>
                  <p className="font-bold">
                    {summary.totalKrw > 0
                      ? Math.round((summary.totalBankKrw / summary.totalKrw) * 100)
                      : 0}%
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card className="border-violet-500/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-violet-400" />
                  분석 결과
                </CardTitle>
                <Badge variant="outline" className="border-violet-500/30 text-violet-400 text-xs">
                  {asked}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="prose-sm max-w-none rounded-lg bg-muted/20 p-4">
                <MarkdownRenderer text={analysis} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                * AI 분석은 참고용이며 투자 결정의 최종 책임은 본인에게 있습니다.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {!analysis && !loading && !error && (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          <Sparkles className="h-12 w-12 opacity-30" />
          <p>버튼을 눌러 포트폴리오 AI 분석을 시작하세요.</p>
          <p className="text-xs">Claude AI가 보유 종목, 수익률, 분산도를 분석하고 실용적인 조언을 제공합니다.</p>
        </div>
      )}
    </div>
  );
}
