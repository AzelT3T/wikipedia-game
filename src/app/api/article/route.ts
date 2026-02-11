import { NextRequest, NextResponse } from "next/server";
import { fetchArticleSnapshot } from "@/lib/wikipedia";

export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get("title")?.trim();

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  try {
    const article = await fetchArticleSnapshot(title, 240);
    return NextResponse.json(article);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch article";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

