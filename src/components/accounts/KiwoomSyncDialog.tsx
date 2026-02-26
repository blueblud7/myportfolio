"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Key, Trash2, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  accountId: number;
  open: boolean;
  onClose: () => void;
  onSynced: () => void;
}

interface SavedCreds {
  account_number: string;
  last_synced_at: string | null;
}

type SyncStatus = "idle" | "syncing" | "success" | "error";

export function KiwoomSyncDialog({ accountId, open, onClose, onSynced }: Props) {
  const t = useTranslations("KiwoomSync");
  const [appKey, setAppKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const [savedCreds, setSavedCreds] = useState<SavedCreds | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncResult, setSyncResult] = useState<{ added: number; updated: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch(`/api/broker/kiwoom?account_id=${accountId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data) setSavedCreds(data);
        else setSavedCreds(null);
      });
  }, [open, accountId]);

  const handleSave = async () => {
    if (!appKey || !secretKey || !accountNumber) return;
    setLoading(true);
    try {
      await fetch("/api/broker/kiwoom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, app_key: appKey, secret_key: secretKey, account_number: accountNumber }),
      });
      setSavedCreds({ account_number: accountNumber, last_synced_at: null });
      setAppKey("");
      setSecretKey("");
      setAccountNumber("");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("deleteConfirm"))) return;
    await fetch(`/api/broker/kiwoom?account_id=${accountId}`, { method: "DELETE" });
    setSavedCreds(null);
  };

  const handleSync = async () => {
    setSyncStatus("syncing");
    setSyncResult(null);
    setErrorMsg("");
    try {
      const res = await fetch("/api/broker/kiwoom", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "동기화 실패");
      setSyncResult({ added: data.added, updated: data.updated, total: data.total });
      setSyncStatus("success");
      setSavedCreds((prev) => prev ? { ...prev, last_synced_at: new Date().toISOString() } : prev);
      onSynced();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "알 수 없는 오류");
      setSyncStatus("error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{t("howToGetKey")}</p>
            <p className="mt-1">{t("howToGetKeyDesc")}</p>
          </div>

          {savedCreds ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{t("accountNumber")}: {savedCreds.account_number}</p>
                  {savedCreds.last_synced_at && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("lastSynced")}: {new Date(savedCreds.last_synced_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary" className="text-xs">{t("registered")}</Badge>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={handleDelete}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {syncStatus === "success" && syncResult && (
                <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>
                    {t("syncResult", { total: syncResult.total, added: syncResult.added, updated: syncResult.updated })}
                  </span>
                </div>
              )}
              {syncStatus === "error" && (
                <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleSync}
                disabled={syncStatus === "syncing"}
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", syncStatus === "syncing" && "animate-spin")} />
                {syncStatus === "syncing" ? t("syncing") : t("syncBtn")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="app-key">{t("appKey")}</Label>
                <Input
                  id="app-key"
                  type="password"
                  placeholder="키움 App Key 입력"
                  value={appKey}
                  onChange={(e) => setAppKey(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="secret-key">{t("secretKey")}</Label>
                <Input
                  id="secret-key"
                  type="password"
                  placeholder="키움 Secret Key 입력"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="account-number">{t("accountNumber")}</Label>
                <Input
                  id="account-number"
                  placeholder="예: 1234567890"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleSave}
                disabled={loading || !appKey || !secretKey || !accountNumber}
              >
                {loading ? t("saving") : t("saveKey")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
