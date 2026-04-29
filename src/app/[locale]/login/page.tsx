"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (mode === "register" && password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      setLoading(false);
      return;
    }

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error ?? (mode === "login" ? "로그인 실패" : "회원가입 실패"));
      setLoading(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setPassword("");
    setPasswordConfirm("");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm px-4">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500 shadow-lg shadow-blue-500/30">
            <TrendingUp className="h-6 w-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">My Portfolio</h1>
            <p className="mt-1 text-sm text-zinc-400">자산 현황 대시보드</p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl backdrop-blur-sm">
          {/* 탭 */}
          <div className="mb-5 flex rounded-xl bg-zinc-800/60 p-1">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                mode === "login"
                  ? "bg-zinc-700 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                mode === "register"
                  ? "bg-zinc-700 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              회원가입
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-zinc-300 text-xs font-medium">
                아이디
              </Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="아이디 입력"
                autoComplete="username"
                autoFocus
                required
                className="border-zinc-700 bg-zinc-800/60 text-white placeholder:text-zinc-500 focus-visible:border-blue-500 focus-visible:ring-blue-500/20"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-zinc-300 text-xs font-medium">
                비밀번호
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 입력 (6자 이상)"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                className="border-zinc-700 bg-zinc-800/60 text-white placeholder:text-zinc-500 focus-visible:border-blue-500 focus-visible:ring-blue-500/20"
              />
            </div>

            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="passwordConfirm" className="text-zinc-300 text-xs font-medium">
                  비밀번호 확인
                </Label>
                <Input
                  id="passwordConfirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="비밀번호 재입력"
                  autoComplete="new-password"
                  required
                  className="border-zinc-700 bg-zinc-800/60 text-white placeholder:text-zinc-500 focus-visible:border-blue-500 focus-visible:ring-blue-500/20"
                />
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400 border border-red-500/20">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="mt-2 w-full bg-blue-500 font-semibold hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20"
              disabled={loading}
            >
              {loading
                ? mode === "login" ? "로그인 중..." : "가입 중..."
                : mode === "login" ? "로그인" : "회원가입"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
