import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/seo";

// OG 이미지 라우트 — 브랜드 다크 카드 (1200×630)
export const alt = "MyPortfolio — 주식 포트폴리오 관리 & 투자 분석 대시보드";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0b0d12";
const GOLD = "#e8b964";
const TEXT = "#e8eaed";
const MUTED = "#9aa0a6";

const FEATURES = [
  "포트폴리오 분석",
  "퀀트 스크리너",
  "CANSLIM",
  "패턴 랩",
  "백테스트",
  "AI 인사이트",
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: BG,
          backgroundImage:
            "radial-gradient(1000px 500px at 85% -10%, rgba(232,185,100,0.16), transparent)",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* 상단: 브랜드 */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              backgroundColor: GOLD,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: BG,
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            M
          </div>
          <div style={{ color: TEXT, fontSize: 34, fontWeight: 700 }}>
            {SITE_NAME}
          </div>
        </div>

        {/* 중앙: 헤드라인 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              color: TEXT,
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: -1,
            }}
          >
            내 투자, 한눈에 명확하게
          </div>
          <div style={{ color: GOLD, fontSize: 36, fontWeight: 600 }}>
            주식 포트폴리오 관리 & 투자 분석
          </div>
        </div>

        {/* 하단: 키워드 칩 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          {FEATURES.map((f) => (
            <div
              key={f}
              style={{
                display: "flex",
                color: MUTED,
                fontSize: 26,
                fontWeight: 500,
                padding: "10px 22px",
                borderRadius: 999,
                border: "1px solid rgba(154,160,166,0.35)",
              }}
            >
              {f}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
