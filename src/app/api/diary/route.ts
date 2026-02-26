import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  const db = getDb();

  let query = "SELECT * FROM diary";
  const params: string[] = [];

  if (year && month) {
    const paddedMonth = month.padStart(2, "0");
    query += ` WHERE date LIKE '${year}-${paddedMonth}%'`;
  } else if (year) {
    query += ` WHERE date LIKE '${year}%'`;
  }

  query += " ORDER BY date DESC, created_at DESC";

  const entries = db.prepare(query).all(...params);
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, content, date, mood, tags } = body;

  if (!title || !date) {
    return NextResponse.json({ error: "title and date required" }, { status: 400 });
  }

  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO diary (title, content, date, mood, tags) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      title.trim(),
      content ?? "",
      date,
      mood ?? "neutral",
      tags ?? ""
    );

  const entry = db.prepare("SELECT * FROM diary WHERE id = ?").get(result.lastInsertRowid);
  return NextResponse.json(entry, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, title, content, date, mood, tags } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const db = getDb();
  db.prepare(
    "UPDATE diary SET title = ?, content = ?, date = ?, mood = ?, tags = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(title, content ?? "", date, mood ?? "neutral", tags ?? "", id);

  const entry = db.prepare("SELECT * FROM diary WHERE id = ?").get(id);
  return NextResponse.json(entry);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const db = getDb();
  db.prepare("DELETE FROM diary WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
