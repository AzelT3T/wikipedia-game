import { NextRequest, NextResponse } from "next/server";
import { generateChallenge } from "@/lib/challenge";
import { createRoom } from "@/lib/room-store";
import { serializeRoomForClient } from "@/lib/room-api";
import { parseDifficulty } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const difficulty = parseDifficulty(body?.difficulty);
    const name = typeof body?.name === "string" ? body.name : "Player 1";

    const challenge = await generateChallenge(difficulty);
    const { room, player } = createRoom(challenge, name);

    const invitePath = `/room/${room.id}`;
    const origin = request.headers.get("origin");

    return NextResponse.json({
      room: serializeRoomForClient(room),
      roomId: room.id,
      playerId: player.id,
      invitePath,
      inviteUrl: origin ? `${origin}${invitePath}` : invitePath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create room";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
