import { ImageResponse } from "next/og";

// 파비콘 PNG fallback (SVG 미지원 브라우저·구글 검색결과용). 빌드 시 생성.
export const size = { width: 48, height: 48 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg,#3b82f6,#22c55e)",
          color: "#fff",
          fontSize: 34,
          fontWeight: 700,
          borderRadius: 11,
        }}
      >
        P
      </div>
    ),
    { ...size },
  );
}
