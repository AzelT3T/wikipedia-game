import { Room } from "./types";
import { roomLeaderboard } from "./room-store";

interface SerializeRoomOptions {
  includeChallenge?: boolean;
  includePlayerProgress?: boolean;
}

export function isChallengeVisible(room: Room, now = Date.now()): boolean {
  if (room.status === "finished") {
    return true;
  }

  if (room.status !== "running") {
    return false;
  }

  if (!room.startAt) {
    return false;
  }

  return now >= room.startAt;
}

export function serializeRoom(room: Room, options: SerializeRoomOptions = {}) {
  const includeChallenge = options.includeChallenge ?? true;
  const includePlayerProgress = options.includePlayerProgress ?? true;

  return {
    id: room.id,
    round: room.round,
    status: room.status,
    createdAt: room.createdAt,
    challenge: includeChallenge ? room.challenge : null,
    startAt: room.startAt,
    winnerId: room.winnerId,
    players: Object.values(room.players).map((player) => ({
      id: player.id,
      name: player.name,
      ready: player.ready,
      joinedAt: player.joinedAt,
      currentTitle: includePlayerProgress ? player.currentTitle : "",
      clicks: includePlayerProgress ? player.clicks : 0,
      pathLength: includePlayerProgress ? player.path.length : 0,
      path: includePlayerProgress ? player.path : [],
      finishedAt: includePlayerProgress ? player.finishedAt : undefined,
    })),
    leaderboard: roomLeaderboard(room),
  };
}
