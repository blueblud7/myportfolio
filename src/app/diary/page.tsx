"use client";

import { useState } from "react";
import useSWR from "swr";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Plus, Pencil, Trash2, Search } from "lucide-react";
import type { DiaryEntry } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const MOODS = [
  { value: "great", label: "😄 최고", color: "bg-emerald-100 text-emerald-700" },
  { value: "good", label: "🙂 좋음", color: "bg-blue-100 text-blue-700" },
  { value: "neutral", label: "😐 보통", color: "bg-gray-100 text-gray-700" },
  { value: "bad", label: "😟 나쁨", color: "bg-orange-100 text-orange-700" },
  { value: "terrible", label: "😡 최악", color: "bg-red-100 text-red-700" },
] as const;

type Mood = typeof MOODS[number]["value"];

function MoodBadge({ mood }: { mood: string }) {
  const m = MOODS.find((x) => x.value === mood) ?? MOODS[2];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${m.color}`}>
      {m.label}
    </span>
  );
}

interface FormState {
  id?: number;
  title: string;
  content: string;
  date: string;
  mood: Mood;
  tags: string;
}

const defaultForm = (): FormState => ({
  title: "",
  content: "",
  date: format(new Date(), "yyyy-MM-dd"),
  mood: "neutral",
  tags: "",
});

export default function DiaryPage() {
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: entries = [], mutate } = useSWR<DiaryEntry[]>("/api/diary", fetcher);

  const filtered = entries.filter(
    (e) =>
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      e.content.toLowerCase().includes(search.toLowerCase()) ||
      e.tags.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setForm(defaultForm());
    setFormOpen(true);
  };

  const openEdit = (entry: DiaryEntry) => {
    setForm({
      id: entry.id,
      title: entry.title,
      content: entry.content,
      date: entry.date,
      mood: entry.mood as Mood,
      tags: entry.tags,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.date) return;
    setSaving(true);

    await fetch("/api/diary", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    await mutate();
    setSaving(false);
    setFormOpen(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("일기를 삭제하시겠습니까?")) return;
    await fetch(`/api/diary?id=${id}`, { method: "DELETE" });
    await mutate();
  };

  const tagList = (tags: string) =>
    tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            투자 일기
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            투자 결정, 시장 상황, 감정 등을 기록하세요.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          새 일기
        </Button>
      </div>

      {/* 검색 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="제목, 내용, 태그 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {MOODS.map((m) => {
          const count = entries.filter((e) => e.mood === m.value).length;
          return (
            <Card key={m.value} className="text-center">
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl">{m.label.split(" ")[0]}</div>
                <div className="text-xs text-muted-foreground mt-1">{m.label.split(" ")[1]}</div>
                <div className="text-xl font-bold mt-1">{count}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 목록 */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          {search ? "검색 결과가 없습니다." : "아직 작성한 일기가 없습니다. 첫 일기를 작성해보세요!"}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => {
            const isExpanded = expandedId === entry.id;
            const tags = tagList(entry.tags);
            return (
              <Card key={entry.id} className="cursor-pointer hover:shadow-sm transition-shadow">
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className="flex-1 min-w-0"
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <MoodBadge mood={entry.mood} />
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(entry.date), "yyyy년 M월 d일 (eee)", { locale: ko })}
                        </span>
                      </div>
                      <h3 className="font-semibold mt-1 truncate">{entry.title}</h3>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(entry)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDelete(entry.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {(isExpanded || !entry.content) && entry.content && (
                  <CardContent className="px-4 pb-4 pt-0">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {entry.content}
                    </p>
                  </CardContent>
                )}
                {!isExpanded && entry.content && (
                  <CardContent className="px-4 pb-3 pt-0">
                    <p
                      className="text-sm text-muted-foreground line-clamp-2 cursor-pointer"
                      onClick={() => setExpandedId(entry.id)}
                    >
                      {entry.content}
                    </p>
                  </CardContent>
                )}
                {tags.length > 0 && (
                  <CardContent className="px-4 pb-3 pt-0">
                    <div className="flex flex-wrap gap-1">
                      {tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* 작성/수정 다이얼로그 */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "일기 수정" : "새 일기 작성"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="diary-date">날짜</Label>
                <Input
                  id="diary-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>오늘의 기분</Label>
                <div className="flex gap-1 flex-wrap">
                  {MOODS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, mood: m.value }))}
                      className={`rounded-full px-2 py-1 text-xs font-medium transition-all ${
                        form.mood === m.value
                          ? m.color + " ring-2 ring-offset-1 ring-current"
                          : "bg-muted text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="diary-title">제목</Label>
              <Input
                id="diary-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="오늘의 투자 요약..."
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="diary-content">내용</Label>
              <textarea
                id="diary-content"
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="시장 상황, 투자 결정 이유, 느낀 점 등을 자유롭게 작성하세요..."
                rows={8}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="diary-tags">태그 (선택, 쉼표로 구분)</Label>
              <Input
                id="diary-tags"
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="예: 삼성전자, 매수, 분할매수"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>
                취소
              </Button>
              <Button onClick={handleSave} disabled={saving || !form.title || !form.date}>
                {saving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
