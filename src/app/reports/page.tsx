"use client";

import { useReports } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AllocationChart } from "@/components/dashboard/AllocationChart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatKRW, formatPercent, gainLossColor } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function ReportsPage() {
  const { data: report, isLoading } = useReports();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">리포트</h1>
        <div className="py-12 text-center text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">리포트</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            데이터가 없습니다. 계좌와 종목을 먼저 추가해주세요.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">리포트</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <AllocationChart
          title="통화별 배분"
          data={report.by_currency.map((c) => ({
            name: c.currency,
            value: c.value_krw,
          }))}
        />
        <AllocationChart
          title="계좌별 배분"
          data={report.by_account.map((a) => ({
            name: a.name,
            value: a.value_krw,
          }))}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Top 5 수익 종목
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                Best
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.top_performers.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">데이터 없음</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>종목</TableHead>
                    <TableHead className="text-right">수익률</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.top_performers.map((p) => (
                    <TableRow key={p.ticker}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.ticker}</div>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono font-medium",
                          gainLossColor(p.gain_loss_pct)
                        )}
                      >
                        {formatPercent(p.gain_loss_pct)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Top 5 손실 종목
              <Badge variant="destructive">Worst</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.worst_performers.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">데이터 없음</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>종목</TableHead>
                    <TableHead className="text-right">수익률</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.worst_performers.map((p) => (
                    <TableRow key={p.ticker}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.ticker}</div>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono font-medium",
                          gainLossColor(p.gain_loss_pct)
                        )}
                      >
                        {formatPercent(p.gain_loss_pct)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>자산 배분 상세</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>계좌</TableHead>
                <TableHead className="text-right">평가금액 (KRW)</TableHead>
                <TableHead className="text-right">비중</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.by_account.map((a) => (
                <TableRow key={a.name}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatKRW(a.value_krw)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {a.pct.toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
