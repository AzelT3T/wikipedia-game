import { NextRequest, NextResponse } from "next/server";
import { applyPlayerMove, getRoom } from "@/lib/room-store";
import { serializeRoomForClient } from "@/lib/room-api";
import { fetchArticleSnapshot } from "@/lib/wikipedia";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;

  try {
    const body = await request.json();
    const playerId = String(body?.playerId ?? "").trim();
    const toTitle = String(body?.toTitle ?? "").trim();

    if (!playerId || !toTitle) {
      return NextResponse.json({ error: "playerId and toTitle are required" }, { status: 400 });
    }

    const room = getRoom(roomId);

    if (!room) {
      return NextResponse.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
    }

    const player = room.players[playerId];

    if (!player) {
      return NextResponse.json({ error: "PLAYER_NOT_FOUND" }, { status: 404 });
    }

    const article = await fetchArticleSnapshot(player.currentTitle, 300);

    if (!article.links.includes(toTitle)) {
      return NextResponse.json({ error: "INVALID_MOVE" }, { status: 400 });
    }

    const updated = applyPlayerMove(roomId, playerId, toTitle);

    return NextResponse.json({
      accepted: true,
      room: serializeRoomForClient(updated),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process move";
    const status =
      message === "ROOM_NOT_FOUND" || message === "PLAYER_NOT_FOUND"
        ? 404
        : message === "ROOM_NOT_RUNNING" || message === "RACE_NOT_STARTED"
          ? 400
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
