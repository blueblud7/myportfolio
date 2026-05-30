import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS "홈 화면에 추가" 용 아이콘 (PNG, 빌드 시 생성)
export default function AppleIcon() {
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
          fontSize: 124,
          fontWeight: 700,
        }}
      >
        P
      </div>
    ),
    { ...size },
  );
}
