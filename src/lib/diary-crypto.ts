import { tryDecrypt } from "./crypto";

export interface DiaryRow {
  id: number;
  date: string;
  user_id: number;
  title_enc: string | null;
  content_enc: string | null;
  mood_enc: string | null;
  tags_enc: string | null;
  title: string | null;
  content: string | null;
  mood: string | null;
  tags: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface DecryptedDiary {
  id: number;
  date: string;
  user_id: number;
  title: string | null;
  content: string | null;
  mood: string | null;
  tags: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function decryptDiaryRow(r: DiaryRow): DecryptedDiary {
  return {
    id: r.id,
    date: r.date,
    user_id: r.user_id,
    title:   r.title_enc   ? tryDecrypt(r.title_enc)   : r.title,
    content: r.content_enc ? tryDecrypt(r.content_enc) : r.content,
    mood:    r.mood_enc    ? tryDecrypt(r.mood_enc)    : r.mood,
    tags:    r.tags_enc    ? tryDecrypt(r.tags_enc)    : r.tags,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
