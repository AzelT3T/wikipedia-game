import { NextRequest, NextResponse } from "next/server";
import { getRoom } from "@/lib/room-store";
import { serializeMeForClient, serializeRoomForClient } from "@/lib/room-api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const room = getRoom(roomId);

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const playerId = request.nextUrl.searchParams.get("playerId") ?? undefined;
  const payload = serializeRoomForClient(room);

  if (!playerId || !room.players[playerId]) {
    return NextResponse.json(payload);
  }

  return NextResponse.json({
    ...payload,
    me: serializeMeForClient(room, playerId),
  });
}
