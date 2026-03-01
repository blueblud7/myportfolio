"use client";

import { useState } from "react";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Bell, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { PriceAlertDialog } from "./PriceAlertDialog";

interface Alert {
  id: number;
  ticker: string;
  name: string;
  target_price: number;
  alert_type: "above" | "below";
  currency: "KRW" | "USD";
  is_active: boolean;
  is_triggered: boolean;
  current_price: number | null;
  note: string;
  created_at: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AlertsList() {
  const t = useTranslations("Alerts");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Alert | null>(null);

  const { data: alerts = [], mutate } = useSWR<Alert[]>("/api/alerts", fetcher, {
    refreshInterval: 60000,
  });

  const handleDelete = async (id: number) => {
    if (!confirm(t("deleteConfirm"))) return;
    await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
    mutate();
  };

  const toggleActive = async (alert: Alert) => {
    await fetch("/api/alerts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: alert.id,
        target_price: alert.target_price,
        alert_type: alert.alert_type,
        note: alert.note,
        is_active: !alert.is_active,
      }),
    });
    mutate();
  };

  const triggered = alerts.filter((a) => a.is_active && a.is_triggered);
  const active = alerts.filter((a) => a.is_active && !a.is_triggered);
  const inactive = alerts.filter((a) => !a.is_active);

  return (
    <div className="space-y-6">
      {triggered.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <Bell className="h-4 w-4" />
            {t("triggeredAlert", { count: triggered.length })}
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {triggered.map((a) => (
              <Badge
                key={a.id}
                variant="outline"
                className="text-amber-700 border-amber-300"
              >
                {a.ticker} {a.alert_type === "above" ? "↑" : "↓"}{" "}
                {a.currency === "USD" ? "$" : "₩"}
                {a.target_price.toLocaleString()}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("title")}</CardTitle>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            {t("addAlert")}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {alerts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {t("noAlerts")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("ticker")}</TableHead>
                    <TableHead>{t("alertType")}</TableHead>
                    <TableHead className="text-right">{t("targetPrice")}</TableHead>
                    <TableHead className="text-right">{t("currentPriceCol")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead>{t("noteCol")}</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...triggered, ...active, ...inactive].map((alert) => (
                    <TableRow
                      key={alert.id}
                      className={cn(!alert.is_active && "opacity-50")}
                    >
                      <TableCell>
                        <div className="font-medium text-sm">{alert.name || alert.ticker}</div>
                        <div className="text-xs text-muted-foreground">{alert.ticker}</div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            alert.alert_type === "above"
                              ? "text-emerald-600 border-emerald-300"
                              : "text-red-500 border-red-300"
                          )}
                        >
                          {alert.alert_type === "above" ? `↑ ${t("above")}` : `↓ ${t("below")}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {alert.currency === "USD" ? "$" : "₩"}
                        {alert.target_price.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {alert.current_price != null
                          ? `${alert.currency === "USD" ? "$" : "₩"}${alert.current_price.toLocaleString()}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {!alert.is_active ? (
                          <Badge variant="secondary">{t("inactive")}</Badge>
                        ) : alert.is_triggered ? (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                            {t("triggered")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-blue-600 border-blue-300">
                            {t("watching")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                        {alert.note || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={alert.is_active ? t("deactivate") : t("activate")}
                            onClick={() => toggleActive(alert)}
                          >
                            {alert.is_active ? (
                              <Bell className="h-3.5 w-3.5" />
                            ) : (
                              <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditing(alert);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDelete(alert.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <PriceAlertDialog
        open={formOpen}
        alert={editing}
        onClose={() => setFormOpen(false)}
        onSave={() => mutate()}
      />
    </div>
  );
}
