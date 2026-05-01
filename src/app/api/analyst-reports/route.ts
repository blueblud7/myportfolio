import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY!;

const SB_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  Prefer: "count=exact",
};

export interface AnalystReport {
  id: number;
  title: string;
  category: string | null;
  date: string | null;
  pdf_url: string | null;
  summary_text: string | null;
  sent: boolean;
  stock_name: string | null;
  firm: string | null;
  recommendation: string | null;
  target_price: string | null;
  ticker: string | null;
  analyst: string | null;
}

export interface AnalystReportsResponse {
  reports: AnalystReport[];
  total: number;
  page: number;
  pageSize: number;
}

export const CATEGORY_MAP: Record<string, string> = {
  "Each Company":       "개별 종목",
  "Market Status":      "시황",
  "Investing Analysis": "투자 전략",
  "Industry Analysis":  "산업 분석",
  "Security Analysis":  "증권 분석",
  "Economy Analysis":   "경제 분석",
};

export async function GET(req: NextRequest) {
  const sp       = new URL(req.url).searchParams;
  const page     = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(sp.get("pageSize") ?? 20)));
  const category = sp.get("category") ?? "";
  const firm     = sp.get("firm") ?? "";
  const search   = sp.get("search") ?? "";
  const offset   = (page - 1) * pageSize;

  let url = `${SUPABASE_URL}/rest/v1/sent_reports?select=id,title,category,date,pdf_url,summary_text,sent,stock_name,firm,recommendation,target_price,ticker,analyst&order=date.desc,id.desc&limit=${pageSize}&offset=${offset}`;

  if (category) url += `&category=eq.${encodeURIComponent(category)}`;
  if (firm)     url += `&firm=eq.${encodeURIComponent(firm)}`;
  if (search) {
    const q = encodeURIComponent(`*${search}*`);
    url += `&or=(title.ilike.${q},stock_name.ilike.${q},firm.ilike.${q})`;
  }

  try {
    const res = await fetch(url, { headers: SB_HEADERS, next: { revalidate: 60 } });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: 500 });
    }
    const range = res.headers.get("content-range") ?? "";
    const total = Number(range.split("/")[1] ?? 0) || 0;
    const reports: AnalystReport[] = await res.json();
    return NextResponse.json({ reports, total, page, pageSize } satisfies AnalystReportsResponse);
  } catch {
    return NextResponse.json({ error: "fetch error" }, { status: 500 });
  }
}
