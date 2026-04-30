import { Info } from "lucide-react";

export function GlobalFooterDisclaimer() {
  return (
    <footer className="mt-8 border-t border-border/40 px-3 sm:px-6 py-4 text-[11px] leading-relaxed text-muted-foreground/70">
      <p>
        본 서비스는 <strong className="text-muted-foreground">정보 제공 목적</strong>이며
        투자 권유·자문이 아닙니다. 표시되는 시세·실적·AI 분석·증권사 리포트는 참고용으로만 사용하시고,
        실제 투자 판단과 그 결과에 대한 책임은 전적으로 사용자 본인에게 있습니다.
        시세 정보는 지연될 수 있으며 정확성을 보장하지 않습니다.
      </p>
    </footer>
  );
}

export function AIDisclaimer({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 ${className}`}>
      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <p className="leading-relaxed">
        AI가 생성한 분석은 <strong>참고용</strong>이며 사실 검증을 거치지 않았습니다.
        실수·환각(hallucination) 가능성이 있으니 투자 판단에 단독으로 사용하지 마세요.
      </p>
    </div>
  );
}
