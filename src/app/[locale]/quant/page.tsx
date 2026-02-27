"use client";

import { useTranslations } from "next-intl";
import { SectorEtfChart } from "@/components/quant/SectorEtfChart";
import { ReturnsCalendar } from "@/components/quant/ReturnsCalendar";

export default function QuantPage() {
  const t = useTranslations("Quant");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <SectorEtfChart />
      <ReturnsCalendar />
    </div>
  );
}
