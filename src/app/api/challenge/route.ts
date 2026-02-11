import { NextRequest, NextResponse } from "next/server";
import { generateChallenge } from "@/lib/challenge";
import { parseDifficulty } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const difficulty = parseDifficulty(body?.difficulty);
    const challenge = await generateChallenge(difficulty);

    return NextResponse.json(challenge);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate challenge";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

