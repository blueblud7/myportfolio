"use client";

import { useState, useEffect } from "react";
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
  const [appKey, setAppKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  const [savedCreds, setSavedCreds] = useState<SavedCreds | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncResult, setSyncResult] = useState<{ added: number; updated: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // 저장된 credentials 불러오기
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
    if (!confirm("API 키를 삭제하시겠습니까?")) return;
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
            키움 REST API 연동
          </DialogTitle>
          <DialogDescription>
            키움 REST API 키를 등록하면 보유종목을 자동으로 불러올 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* API 키 발급 안내 */}
          <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">API 키 발급 방법</p>
            <p className="mt-1">openapi.kiwoom.com 에서 신청 → App Key / Secret Key 발급</p>
          </div>

          {savedCreds ? (
            /* 저장된 키가 있는 경우 */
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">계좌번호: {savedCreds.account_number}</p>
                  {savedCreds.last_synced_at && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      마지막 동기화: {new Date(savedCreds.last_synced_at).toLocaleString("ko-KR")}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary" className="text-xs">등록됨</Badge>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={handleDelete}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* 동기화 결과 */}
              {syncStatus === "success" && syncResult && (
                <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>
                    동기화 완료: 총 {syncResult.total}종목 (신규 {syncResult.added}개, 업데이트 {syncResult.updated}개)
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
                {syncStatus === "syncing" ? "동기화 중..." : "보유종목 동기화"}
              </Button>
            </div>
          ) : (
            /* API 키 입력 폼 */
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="app-key">App Key</Label>
                <Input
                  id="app-key"
                  type="password"
                  placeholder="키움 App Key 입력"
                  value={appKey}
                  onChange={(e) => setAppKey(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="secret-key">Secret Key</Label>
                <Input
                  id="secret-key"
                  type="password"
                  placeholder="키움 Secret Key 입력"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="account-number">계좌번호</Label>
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
                {loading ? "저장 중..." : "API 키 저장"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
