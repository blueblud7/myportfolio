import { NextRequest, NextResponse } from "next/server";
import { getExportMapping } from "@/lib/export-mapping";
import { getExportTrend, type ExportTrend } from "@/lib/korea-export";

export interface ExportTrendResponse {
  ticker: string;
  supported: boolean;       // 수출 매핑 존재 여부
  configured: boolean;      // DATA_GO_KR_KEY 설정 여부
  hs?: string;
  item?: string;
  total: ExportTrend | null;
  byCountry: { code: string; label: string; trend: ExportTrend | null }[];
}

/** 관세청 데이터는 매월 15일경 갱신 → 직전 달(또는 2달 전)을 종료 연월로 사용 */
function defaultEndYymm(): string {
  const now = new Date();
  // 보수적으로 2달 전까지 확정 데이터로 간주
  const target = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${target.getFullYear()}${String(target.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim();
  if (!ticker) {
    return NextResponse.json({ error: "ticker parameter required" }, { status: 400 });
  }

  const mapping = getExportMapping(ticker);
  const configured = Boolean(process.env.DATA_GO_KR_KEY);

  if (!mapping) {
    const body: ExportTrendResponse = {
      ticker, supported: false, configured, total: null, byCountry: [],
    };
    return NextResponse.json(body);
  }

  const endYymm = (searchParams.get("end") ?? "").match(/^\d{6}$/)?.[0] ?? defaultEndYymm();
  const monthsParam = Number(searchParams.get("months"));
  const months = Number.isFinite(monthsParam) && monthsParam > 0 && monthsParam <= 60
    ? Math.floor(monthsParam) : 24;

  const total = await getExportTrend(mapping.hs, endYymm, months, "");

  const byCountry = await Promise.all(
    (mapping.focus ?? []).map(async (c) => ({
      code: c.code,
      label: c.label,
      trend: await getExportTrend(mapping.hs, endYymm, months, c.code),
    })),
  );

  const body: ExportTrendResponse = {
    ticker,
    supported: true,
    configured,
    hs: mapping.hs,
    item: mapping.item,
    total,
    byCountry,
  };
  return NextResponse.json(body);
}
