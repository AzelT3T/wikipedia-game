import { NextRequest, NextResponse } from "next/server";
import { getRoom, joinRoom } from "@/lib/room-store";
import { serializeRoomForClient } from "@/lib/room-api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name : "Player 2";

    const player = joinRoom(roomId, name);
    const room = getRoom(roomId);

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    return NextResponse.json({
      playerId: player.id,
      room: serializeRoomForClient(room),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to join room";
    const status =
      message === "ROOM_NOT_FOUND" ? 404 : message === "ROOM_FULL" || message === "ROOM_ALREADY_STARTED" ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
