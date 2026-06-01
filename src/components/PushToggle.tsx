"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Send } from "lucide-react";
import { cn } from "@/lib/utils";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setSupported(true);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, []);

  if (!supported) return null;

  const subscribe = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (!VAPID_PUBLIC_KEY) {
        setMsg("VAPID 키가 설정되지 않았습니다");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMsg("알림 권한이 거부되었습니다");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) {
        setMsg("구독 저장 실패");
        return;
      }
      setSubscribed(true);
      setMsg("알림이 켜졌습니다");
    } catch {
      setMsg("알림 켜기 실패");
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMsg("알림이 꺼졌습니다");
    } catch {
      setMsg("알림 끄기 실패");
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error || "테스트 전송 실패");
        return;
      }
      setMsg(`테스트 전송 완료 (${data.sent ?? 0}건)`);
    } catch {
      setMsg("테스트 전송 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={subscribed ? unsubscribe : subscribe}
        disabled={busy}
        title={subscribed ? "알림 끄기" : "알림 켜기"}
        aria-label={subscribed ? "알림 끄기" : "알림 켜기"}
        className={cn(
          "flex h-8 w-8 sm:h-7 sm:w-7 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40",
          subscribed && "text-foreground",
        )}
      >
        {subscribed ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
      </button>
      {subscribed && (
        <button
          onClick={sendTest}
          disabled={busy}
          title="테스트 알림 보내기"
          aria-label="테스트 알림 보내기"
          className="flex h-8 w-8 sm:h-7 sm:w-7 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      )}
      {msg && <span className="hidden sm:inline text-[11px] text-muted-foreground">{msg}</span>}
    </div>
  );
}
