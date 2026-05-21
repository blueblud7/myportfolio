"use client";

import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { AlertsList } from "@/components/alerts/AlertsList";

export default function AlertsPage() {
  const t = useTranslations("Alerts");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gutter)" }}>
      <div className="topbar">
        <div>
          <div className="crumb">도구</div>
          <h1>{t("title")}</h1>
        </div>
      </div>
      <AlertsList />
    </div>
  );
}
