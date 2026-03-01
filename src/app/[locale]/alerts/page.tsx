"use client";

import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { AlertsList } from "@/components/alerts/AlertsList";

export default function AlertsPage() {
  const t = useTranslations("Alerts");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="h-6 w-6" />
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{t("description")}</p>
      </div>
      <AlertsList />
    </div>
  );
}
