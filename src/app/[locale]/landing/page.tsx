import Link from "next/link";
import "./landing.css";

/* ── Deterministic sparkline data ── */
const series = (n: number, base: number, vol = 0.02, seed = 1): number[] => {
  const out: number[] = [];
  let v = base;
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    v = v * (1 + (s / 233280 - 0.5) * vol);
    out.push(+v.toFixed(2));
  }
  return out;
};

/* ── Inline SVG icons ── */
function IconTrendUp({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}
function IconBarChart({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
function IconPieChart({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  );
}
function IconBell({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
function IconZap({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
function IconShield({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function IconLayers({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}
function IconCheck({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IconX({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IconPlay({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" />
    </svg>
  );
}
function IconArrowRight({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/* ── Sparkline SVG ── */
function Sparkline({ data, color = "var(--accent)", height = 36, width = 120 }: { data: number[]; color?: string; height?: number; width?: number }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <polyline points={pts.join(" ")} stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ── Mini bar chart ── */
function MiniBar({ data, color = "var(--accent)", height = 32, width = 80 }: { data: number[]; color?: string; height?: number; width?: number }) {
  const max = Math.max(...data);
  const barW = (width / data.length) - 2;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      {data.map((v, i) => {
        const bh = (v / max) * height;
        return (
          <rect
            key={i}
            x={i * (barW + 2)}
            y={height - bh}
            width={barW}
            height={bh}
            rx="1"
            fill={color}
            opacity={i === data.length - 1 ? 1 : 0.5}
          />
        );
      })}
    </svg>
  );
}

/* ── Mini donut ── */
function MiniDonut({ slices }: { slices: { pct: number; color: string }[] }) {
  const r = 28;
  const cx = 32;
  const cy = 32;
  const stroke = 10;
  let cumPct = 0;
  const circumference = 2 * Math.PI * r;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      {slices.map((s, i) => {
        const offset = circumference * (1 - cumPct);
        const dash = circumference * s.pct;
        cumPct += s.pct;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circumference}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
      })}
    </svg>
  );
}

/* ══════════════════════════════════════════
   PAGE COMPONENT
══════════════════════════════════════════ */
export default function LandingPage() {
  const portfolioData = series(32, 100, 0.025, 7);
  const stockA = series(20, 185, 0.03, 3);
  const stockB = series(20, 92, 0.04, 11);
  const monthlyReturns = [2.1, -0.8, 3.4, 1.2, 4.1, -1.3, 2.8, 0.9, 3.6, 1.5, 2.2, 4.3];

  return (
    <div className="landing">

      {/* ── NAV ── */}
      <header>
        <div className="ld-container">
          <nav className="ld-nav">
            <div className="ld-nav-brand">
              <div className="brand-mark">M</div>
              MyPortfolio
            </div>
            <div className="ld-nav-links">
              <a href="#features">기능</a>
              <a href="#how">사용법</a>
              <a href="#pricing">요금제</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="ld-nav-right">
              <div className="ld-nav-pill">
                <span className="now-pulse" />
                실시간 데이터
              </div>
              <Link href="/dashboard" className="ld-btn ld-btn-primary" style={{ height: 32, fontSize: 13 }}>
                대시보드 열기
              </Link>
            </div>
          </nav>
        </div>
      </header>

      {/* ── HERO ── */}
      <div className="ld-container">
        <div className="ld-hero">
          <div>
            <div className="ld-eyebrow">
              <IconZap size={11} />
              개인 자산 관리의 새로운 기준
            </div>
            <h1>
              내 투자, 한눈에<br />
              <span className="accent">명확하게</span>
            </h1>
            <p className="lead">
              국내외 주식·ETF·현금을 하나의 대시보드에서 추적하세요.
              실시간 시세, 포트폴리오 분석, AI 인사이트까지 — 투자 판단에 필요한 모든 것.
            </p>
            <div className="ld-cta-row">
              <Link href="/dashboard" className="ld-btn ld-btn-primary">
                무료로 시작하기
                <IconArrowRight size={14} />
              </Link>
              <a href="#features" className="ld-btn ld-btn-ghost">
                <IconPlay size={14} />
                기능 살펴보기
              </a>
            </div>
            <div className="ld-trust">
              <div className="ld-avatars">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="av"
                    style={{
                      background: [
                        "oklch(0.55 0.12 75)",
                        "oklch(0.50 0.14 215)",
                        "oklch(0.52 0.13 150)",
                        "oklch(0.50 0.12 280)",
                      ][n - 1],
                    }}
                  />
                ))}
              </div>
              <span>이미 <strong style={{ color: "var(--fg-2)" }}>1,200+</strong>명의 투자자가 사용 중</span>
            </div>
          </div>

          {/* ── Hero preview ── */}
          <div className="ld-preview">
            {/* Floating badge top-left */}
            <div className="ld-floating ld-floating-1" style={{ zIndex: 2 }}>
              <div className="ld-row" style={{ gap: 8, marginBottom: 4 }}>
                <span className="now-pulse" />
                <span style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>포트폴리오</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, letterSpacing: "-0.02em" }}>
                ₩142,380,000
              </div>
              <div className="text-up" style={{ fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 2 }}>
                +4.2% 오늘
              </div>
            </div>

            {/* Floating badge bottom-right */}
            <div className="ld-floating ld-floating-2" style={{ zIndex: 2 }}>
              <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 6, fontFamily: "var(--font-mono)" }}>AI 인사이트</div>
              <div style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.5, maxWidth: 160 }}>
                반도체 섹터 비중 과다,<br />리밸런싱 추천
              </div>
              <div className="ld-tag accent" style={{ marginTop: 8 }}>
                <IconZap size={9} /> 신호 감지
              </div>
            </div>

            <div className="ld-preview-frame">
              <div className="ld-preview-chrome">
                <div className="dot" />
                <div className="dot" />
                <div className="dot" />
                <div className="url">myportfolio.app/dashboard</div>
              </div>
              <div className="preview-content">
                {/* mini sidebar */}
                <div className="preview-sidebar">
                  {["대시보드", "계좌", "관심종목", "분석", "예산"].map((item, i) => (
                    <div key={item} className={`pi${i === 0 ? " active" : ""}`}>
                      <div className="pdot" />
                      {item}
                    </div>
                  ))}
                </div>
                {/* mini main */}
                <div className="preview-main">
                  <div className="preview-hero">
                    <div style={{ fontSize: 9, color: "var(--fg-4)", fontFamily: "var(--font-mono)", marginBottom: 4 }}>총 평가금액</div>
                    <div className="pnum">₩142.4M</div>
                    <div className="ld-row" style={{ gap: 6, marginTop: 4 }}>
                      <span className="pdelta text-up">+4.2%</span>
                      <Sparkline data={portfolioData} height={22} width={80} />
                    </div>
                  </div>
                  <div className="preview-grid">
                    {[
                      { name: "삼성전자", val: "+2.1%", up: true },
                      { name: "AAPL", val: "+1.8%", up: true },
                      { name: "NVDA", val: "-0.4%", up: false },
                    ].map((s) => (
                      <div key={s.name} className="preview-tile">
                        {s.name}
                        <div className={`pn ${s.up ? "text-up" : "text-down"}`}>{s.val}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mp">
                    <div className="ld-row" style={{ gap: 8, justifyContent: "space-between" }}>
                      <span style={{ color: "var(--fg-4)" }}>월 수익률</span>
                      <div className="mp-num text-up">+3.6%</div>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <MiniBar data={monthlyReturns.map(Math.abs)} height={20} width={160} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── LOGOS / INTEGRATIONS ── */}
      <div className="ld-marquee">
        <div className="ld-marquee-label">연동 지원</div>
        <div className="ld-logos">
          {[
            { name: "키움증권", sub: "KR" },
            { name: "삼성증권", sub: "KR" },
            { name: "미래에셋", sub: "KR" },
            { name: "Interactive Brokers", sub: "US" },
            { name: "Alpaca", sub: "US" },
            { name: "Yahoo Finance", sub: "Data" },
          ].map((l) => (
            <div key={l.name} className="logo">
              {l.name}
              <span className="sub">{l.sub}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── STATS BAND ── */}
      <div className="ld-container" style={{ marginTop: 64 }}>
        <div className="ld-stats">
          <div className="ld-stat">
            <div className="num accent">142M+</div>
            <div className="lab">추적 중인 총 자산 규모 (원)</div>
          </div>
          <div className="ld-stat">
            <div className="num">1,200+</div>
            <div className="lab">활성 사용자</div>
          </div>
          <div className="ld-stat">
            <div className="num">99.9%</div>
            <div className="lab">서비스 가동률</div>
          </div>
          <div className="ld-stat">
            <div className="num accent">5분</div>
            <div className="lab">자동 시세 갱신 주기</div>
          </div>
        </div>
      </div>

      {/* ── FEATURES BENTO ── */}
      <section className="ld-section" id="features">
        <div className="ld-container">
          <div className="ld-section-head">
            <div className="ld-section-eyebrow">핵심 기능</div>
            <h2>투자에 필요한 모든 것,<br /><em>하나의 화면에서</em></h2>
            <p>복잡한 스프레드시트 없이도 포트폴리오를 체계적으로 관리하세요.</p>
          </div>

          <div className="ld-bento">

            {/* Bento 1 — Portfolio chart (4 cols, 2 rows) */}
            <div className="ld-bento-card bento-1">
              <div className="ic"><IconTrendUp size={16} /></div>
              <h3>실시간 포트폴리오 추적</h3>
              <p>국내·해외 보유 종목을 자동으로 집계해 통합 평가금액과 수익률을 즉시 확인합니다.</p>
              <div className="viz">
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 28, letterSpacing: "-0.03em" }}>₩142.4M</span>
                  <span className="text-up" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>+18.3% 올해</span>
                </div>
                <Sparkline data={portfolioData} width={380} height={80} />
              </div>
            </div>

            {/* Bento 2 — Alerts */}
            <div className="ld-bento-card bento-2">
              <div className="ic"><IconBell size={16} /></div>
              <h3>스마트 알림</h3>
              <p>목표가 도달, 급등락, 리밸런싱 신호를 즉각 알려드립니다.</p>
              <div className="viz" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { text: "NVDA 목표가 도달", type: "accent" },
                  { text: "삼성전자 -3% 급락", type: "down" },
                  { text: "리밸런싱 필요", type: "up" },
                ].map((a) => (
                  <div key={a.text} className={`ld-tag ${a.type}`} style={{ fontSize: 11, height: 26 }}>
                    {a.text}
                  </div>
                ))}
              </div>
            </div>

            {/* Bento 3 — Allocation donut */}
            <div className="ld-bento-card bento-3">
              <div className="ic"><IconPieChart size={16} /></div>
              <h3>자산 배분 분석</h3>
              <p>섹터·국가·자산군별 비중을 시각화합니다.</p>
              <div className="viz" style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <MiniDonut slices={[
                  { pct: 0.45, color: "oklch(0.84 0.12 75)" },
                  { pct: 0.25, color: "oklch(0.74 0.14 215)" },
                  { pct: 0.20, color: "oklch(0.74 0.12 150)" },
                  { pct: 0.10, color: "oklch(0.74 0.18 25)" },
                ]} />
                <div style={{ fontSize: 11, color: "var(--fg-3)", display: "flex", flexDirection: "column", gap: 4 }}>
                  <span><span style={{ color: "oklch(0.84 0.12 75)", marginRight: 4 }}>■</span>국내주식 45%</span>
                  <span><span style={{ color: "oklch(0.74 0.14 215)", marginRight: 4 }}>■</span>해외주식 25%</span>
                  <span><span style={{ color: "oklch(0.74 0.12 150)", marginRight: 4 }}>■</span>ETF 20%</span>
                  <span><span style={{ color: "oklch(0.74 0.18 25)", marginRight: 4 }}>■</span>현금 10%</span>
                </div>
              </div>
            </div>

            {/* Bento 4 — Quant signals */}
            <div className="ld-bento-card bento-4">
              <div className="ic"><IconZap size={16} /></div>
              <h3>퀀트 신호 & 백테스트</h3>
              <p>CANSLIM 스코어, 모멘텀, 변동성 지표를 활용한 종목 선별 및 전략 백테스트를 제공합니다.</p>
              <div className="viz" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {[
                  { label: "모멘텀", score: 82, color: "var(--up)" },
                  { label: "밸류에이션", score: 65, color: "var(--accent)" },
                  { label: "퀄리티", score: 74, color: "oklch(0.74 0.14 215)" },
                ].map((s) => (
                  <div key={s.label} style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, color: s.color, letterSpacing: "-0.02em" }}>{s.score}</div>
                    <div style={{ fontSize: 10.5, color: "var(--fg-4)", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bento 5 — Stock sparklines */}
            <div className="ld-bento-card bento-5">
              <div className="ic"><IconBarChart size={16} /></div>
              <h3>보유 종목 현황</h3>
              <p>각 종목의 수익률, 보유 수량, 평균 단가를 한눈에 파악합니다.</p>
              <div className="viz" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { ticker: "005930", name: "삼성전자", data: stockA, delta: "+2.1%", up: true },
                  { ticker: "AAPL", name: "Apple Inc.", data: stockB, delta: "+1.8%", up: true },
                ].map((s) => (
                  <div key={s.ticker} className="ld-row" style={{ gap: 10, justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, minWidth: 60 }}>{s.ticker}</span>
                    <Sparkline data={s.data} width={80} height={24} color={s.up ? "var(--up)" : "var(--down)"} />
                    <span className={s.up ? "text-up" : "text-down"} style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{s.delta}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bento 6 — Security */}
            <div className="ld-bento-card bento-6">
              <div className="ic"><IconShield size={16} /></div>
              <h3>프라이버시 우선</h3>
              <p>잔액 숨기기 모드, 로컬 우선 저장 — 내 데이터는 내 것.</p>
            </div>

            {/* Bento 7 — Pattern lab */}
            <div className="ld-bento-card bento-7">
              <div className="ic"><IconLayers size={16} /></div>
              <h3>패턴 랩 & 시나리오 분석</h3>
              <p>과거 유사 패턴을 찾아 향후 10년 시나리오를 예측합니다. 유사도 기반 매칭으로 리스크와 기회를 동시에 파악하세요.</p>
              <div className="viz" style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
                {[0.65, 0.82, 0.71, 0.90, 0.78, 0.88].map((v, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{ height: v * 40, width: 18, borderRadius: 3, background: `oklch(0.84 0.12 75 / ${v})` }} />
                    <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--fg-4)" }}>{Math.round(v * 100)}%</span>
                  </div>
                ))}
                <span style={{ fontSize: 11, color: "var(--fg-3)", marginLeft: 6 }}>유사 패턴 매칭</span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="ld-section" id="how" style={{ background: "var(--bg-2)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="ld-container">
          <div className="ld-section-head">
            <div className="ld-section-eyebrow">사용 방법</div>
            <h2>3단계로 <em>시작</em>하세요</h2>
            <p>복잡한 설정 없이 바로 내 포트폴리오를 관리할 수 있습니다.</p>
          </div>
          <div className="ld-flow">
            <div className="ld-flow-card">
              <div className="step"><span className="n">1</span>계좌 연결</div>
              <h3>증권사 연동</h3>
              <p>키움·삼성·미래에셋 등 주요 증권사 계좌를 API로 연동하거나 CSV로 직접 가져오세요.</p>
              <div className="ex">
                계좌 → API 키 입력<br />
                또는 CSV 파일 업로드<br />
                <span className="text-accent">→ 자동으로 종목·수량·단가 인식</span>
              </div>
            </div>
            <div className="ld-flow-card">
              <div className="step"><span className="n">2</span>실시간 추적</div>
              <h3>자동 시세 갱신</h3>
              <p>5분마다 최신 시세를 가져와 수익률과 평가금액을 자동으로 업데이트합니다.</p>
              <div className="ex">
                <span className="now-pulse" style={{ verticalAlign: "middle", marginRight: 6 }} />
                5분마다 자동 갱신 중…<br />
                탭 포커스 시 즉시 갱신
              </div>
            </div>
            <div className="ld-flow-card">
              <div className="step"><span className="n">3</span>인사이트 활용</div>
              <h3>AI 분석 & 알림</h3>
              <p>퀀트 신호, 패턴 분석, 리밸런싱 제안 등 데이터 기반 인사이트를 바로 실행에 옮기세요.</p>
              <div className="ex">
                포트폴리오 분석 완료<br />
                반도체 비중 48% → 권장 35%<br />
                <span className="text-accent">→ 리밸런싱 실행하기</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL ── */}
      <section className="ld-section">
        <div className="ld-container">
          <div className="ld-testimonial">
            <div className="ld-testimonial-meta">
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-4)", marginBottom: 8 }}>포트폴리오 규모</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, letterSpacing: "-0.03em" }}>₩230M</div>
                <div className="text-up" style={{ fontSize: 12, fontFamily: "var(--font-mono)", marginTop: 4 }}>+22.4% YTD</div>
              </div>
              <div style={{ marginTop: 24 }}>
                <Sparkline data={series(24, 185, 0.03, 42)} width={160} height={48} />
              </div>
              <div style={{ marginTop: 20, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="ld-tag accent">국내주식</span>
                <span className="ld-tag up">해외ETF</span>
                <span className="ld-tag">현금</span>
              </div>
            </div>
            <blockquote>
              예전에는 엑셀로 하나하나 업데이트했는데, 이제는 아침에 앱 열면 모든 게 준비돼 있어요. 패턴 랩 기능 덕분에 작년 하락장과 비슷한 구간을 미리 파악하고 선제적으로 대응했습니다.
              <cite><strong>김민준</strong> · 개인 투자자 · 12년 경력</cite>
            </blockquote>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="ld-section" id="pricing">
        <div className="ld-container">
          <div className="ld-section-head" style={{ alignItems: "center", textAlign: "center", maxWidth: "100%" }}>
            <div className="ld-section-eyebrow">요금제</div>
            <h2>단순하고 <em>투명한</em> 가격</h2>
            <p>모든 플랜에 14일 무료 체험 포함. 신용카드 불필요.</p>
          </div>
          <div className="ld-pricing">

            {/* Starter */}
            <div className="ld-price-card">
              <div className="ld-price-name">Starter</div>
              <div className="ld-price-amount">
                <span className="big">무료</span>
              </div>
              <div className="ld-price-desc">개인 포트폴리오 관리를 시작하기에 딱 알맞은 플랜.</div>
              <ul className="ld-price-features">
                <li><IconCheck />계좌 2개 연동</li>
                <li><IconCheck />실시간 시세 (15분 지연)</li>
                <li><IconCheck />기본 포트폴리오 대시보드</li>
                <li><IconCheck />월 30회 새로고침</li>
                <li className="muted"><IconX />AI 인사이트</li>
                <li className="muted"><IconX />패턴 랩</li>
              </ul>
              <Link href="/dashboard" className="ld-btn" style={{ justifyContent: "center" }}>
                무료로 시작
              </Link>
            </div>

            {/* Pro (featured) */}
            <div className="ld-price-card featured">
              <div className="ld-price-name">Pro</div>
              <div className="ld-price-amount">
                <span className="big">₩9,900</span>
                <span className="unit">/월</span>
              </div>
              <div className="ld-price-desc">진지한 투자자를 위한 풀 기능 플랜.</div>
              <ul className="ld-price-features">
                <li><IconCheck />계좌 무제한</li>
                <li><IconCheck />실시간 시세 (5분 갱신)</li>
                <li><IconCheck />AI 인사이트 & 알림</li>
                <li><IconCheck />패턴 랩 & 백테스트</li>
                <li><IconCheck />CANSLIM 스코어링</li>
                <li><IconCheck />포트폴리오 시뮬레이터</li>
              </ul>
              <Link href="/dashboard" className="ld-btn ld-btn-primary" style={{ justifyContent: "center" }}>
                14일 무료 체험
              </Link>
            </div>

            {/* Team */}
            <div className="ld-price-card">
              <div className="ld-price-name">Team</div>
              <div className="ld-price-amount">
                <span className="big">₩24,900</span>
                <span className="unit">/월</span>
              </div>
              <div className="ld-price-desc">투자 스터디 그룹이나 소규모 팀을 위한 플랜.</div>
              <ul className="ld-price-features">
                <li><IconCheck />Pro 기능 전체</li>
                <li><IconCheck />팀원 5명까지</li>
                <li><IconCheck />포트폴리오 공유 & 비교</li>
                <li><IconCheck />공동 관심종목 목록</li>
                <li><IconCheck />우선 지원</li>
                <li><IconCheck />API 접근</li>
              </ul>
              <Link href="/dashboard" className="ld-btn" style={{ justifyContent: "center" }}>
                팀으로 시작
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="ld-section" id="faq">
        <div className="ld-container">
          <div className="ld-section-head" style={{ alignItems: "center", maxWidth: "100%" }}>
            <div className="ld-section-eyebrow">자주 묻는 질문</div>
            <h2>궁금한 점이 있으신가요?</h2>
          </div>
          <div className="ld-faq">
            {[
              {
                q: "실제 증권사 계좌와 연동되나요?",
                a: "현재는 CSV 임포트와 수동 입력을 지원합니다. 주요 증권사 API 연동은 2025년 하반기 출시 예정입니다.",
              },
              {
                q: "내 금융 데이터는 어떻게 보호되나요?",
                a: "모든 민감 데이터는 AES-256으로 암호화되며 서버에 원문이 저장되지 않습니다. 잔액 숨기기 모드로 화면 캡처 시에도 금액이 표시되지 않습니다.",
              },
              {
                q: "무료 플랜에서 유료로 업그레이드하면 데이터가 유지되나요?",
                a: "네, 모든 기존 데이터·설정·포트폴리오 히스토리가 그대로 이관됩니다.",
              },
              {
                q: "패턴 랩은 어떻게 동작하나요?",
                a: "최근 주가 흐름과 가장 유사한 과거 패턴을 유사도 알고리즘으로 매칭하고, 이후 전개 시나리오를 10년 범위로 시각화합니다. 투자 판단에 참고용으로 활용하세요.",
              },
              {
                q: "해외 주식도 지원하나요?",
                a: "미국 주식(NYSE, NASDAQ), 국내 주식(KOSPI, KOSDAQ), 주요 ETF를 지원합니다. 환율은 실시간으로 원화 환산됩니다.",
              },
            ].map((item) => (
              <details key={item.q} className="ld-faq-item">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BAND ── */}
      <div className="ld-container" style={{ paddingBottom: 80 }}>
        <div className="ld-cta">
          <h2>지금 바로 <em>시작하세요</em></h2>
          <p>14일 무료 체험, 신용카드 불필요. 언제든 취소 가능.</p>
          <div className="ld-cta-row">
            <Link href="/dashboard" className="ld-btn ld-btn-primary">
              무료로 시작하기
              <IconArrowRight size={14} />
            </Link>
            <a href="#features" className="ld-btn ld-btn-ghost">기능 더보기</a>
          </div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="ld-footer">
        <div className="ld-container">
          <div className="ld-footer-row">
            <div className="ld-footer-col">
              <div className="ld-nav-brand" style={{ marginBottom: 12 }}>
                <div className="brand-mark">M</div>
                MyPortfolio
              </div>
              <p style={{ fontSize: 13, color: "var(--fg-3)", lineHeight: 1.6, maxWidth: 220 }}>
                개인 투자자를 위한 스마트 자산 관리 플랫폼.
              </p>
            </div>
            <div className="ld-footer-col">
              <h4>제품</h4>
              <a href="#features">기능</a>
              <a href="#pricing">요금제</a>
              <a href="#how">사용법</a>
              <Link href="/dashboard">대시보드</Link>
            </div>
            <div className="ld-footer-col">
              <h4>분석 도구</h4>
              <Link href="/pattern-lab">패턴 랩</Link>
              <Link href="/backtest">백테스트</Link>
              <Link href="/quant">퀀트 스크리너</Link>
              <Link href="/canslim">CANSLIM</Link>
            </div>
            <div className="ld-footer-col">
              <h4>지원</h4>
              <a href="#faq">FAQ</a>
              <a href="mailto:support@myportfolio.app">이메일 문의</a>
              <a href="#">릴리즈 노트</a>
            </div>
            <div className="ld-footer-col">
              <h4>법률</h4>
              <a href="#">이용약관</a>
              <a href="#">개인정보처리방침</a>
              <a href="#">투자 유의사항</a>
            </div>
          </div>
          <div className="ld-footer-bottom">
            <span>© 2026 MyPortfolio · 투자에는 원금손실 위험이 있습니다</span>
            <span style={{ color: "var(--fg-4)" }}>v0.9.0-beta</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
