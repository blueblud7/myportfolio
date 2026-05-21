"use client";

import { useTranslations } from "next-intl";
import { SectorEtfChart } from "@/components/quant/SectorEtfChart";
import { ReturnsCalendar } from "@/components/quant/ReturnsCalendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CanSlimPage from "../canslim/page";
import PatternPage from "../pattern/page";
import ComparePage from "../compare/page";
import VolatilityPage from "../volatility/page";

export default function QuantPage() {
  const t = useTranslations("Quant");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gutter)" }}>
      <div className="topbar">
        <div>
          <div className="crumb">분석</div>
          <h1>{t("title")}</h1>
        </div>
      </div>
      <Tabs defaultValue="basic">
        <TabsList>
          <TabsTrigger value="basic">섹터 &amp; 달력</TabsTrigger>
          <TabsTrigger value="canslim">CAN SLIM</TabsTrigger>
          <TabsTrigger value="pattern">패턴분석</TabsTrigger>
          <TabsTrigger value="compare">상대강도</TabsTrigger>
          <TabsTrigger value="volatility">변동성</TabsTrigger>
        </TabsList>
        <TabsContent value="basic" className="mt-6 space-y-6">
          <SectorEtfChart />
          <ReturnsCalendar />
        </TabsContent>
        <TabsContent value="canslim" className="mt-6">
          <CanSlimPage />
        </TabsContent>
        <TabsContent value="pattern" className="mt-6">
          <PatternPage />
        </TabsContent>
        <TabsContent value="compare" className="mt-6">
          <ComparePage />
        </TabsContent>
        <TabsContent value="volatility" className="mt-6">
          <VolatilityPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
