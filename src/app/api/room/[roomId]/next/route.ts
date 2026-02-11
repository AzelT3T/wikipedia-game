import { NextRequest, NextResponse } from "next/server";
import { generateChallenge } from "@/lib/challenge";
import { getRoom, startNextRound } from "@/lib/room-store";
import { serializeRoomForClient } from "@/lib/room-api";
import { parseDifficulty } from "@/lib/validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const playerId = String(body?.playerId ?? "").trim();

    if (!playerId) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    const room = getRoom(roomId);

    if (!room) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
    }

    const difficulty = parseDifficulty(body?.difficulty ?? room.challenge.difficulty);
    const challenge = await generateChallenge(difficulty, {
      excludeGoalTitles: [room.challenge.goalTitle],
    });
    const updated = startNextRound(roomId, playerId, challenge);

    return NextResponse.json({ room: serializeRoomForClient(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare next round";
    const status =
      message === "ROOM_NOT_FOUND" || message === "PLAYER_NOT_FOUND"
        ? 404
        : message === "ROOM_IN_PROGRESS"
          ? 400
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
