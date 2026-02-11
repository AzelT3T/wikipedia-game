import { NextRequest, NextResponse } from "next/server";
import { setPlayerReady } from "@/lib/room-store";
import { serializeRoomForClient } from "@/lib/room-api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;

  try {
    const body = await request.json();
    const playerId = String(body?.playerId ?? "").trim();
    const ready = Boolean(body?.ready);

    if (!playerId) {
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    }

    const room = setPlayerReady(roomId, playerId, ready);
    return NextResponse.json({ room: serializeRoomForClient(room) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update ready state";
    const status = message === "ROOM_NOT_FOUND" || message === "PLAYER_NOT_FOUND" ? 404 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
