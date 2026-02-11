import { isChallengeVisible, serializeRoom } from "./room-response";
import { Room } from "./types";

export function serializeRoomForClient(room: Room) {
  const challengeVisible = isChallengeVisible(room);
  const includePlayerProgress = challengeVisible || room.status === "finished";

  return serializeRoom(room, {
    includeChallenge: challengeVisible,
    includePlayerProgress,
  });
}

export function serializeMeForClient(room: Room, playerId: string) {
  const me = room.players[playerId];

  if (!me) {
    return undefined;
  }

  const visible = isChallengeVisible(room) || room.status === "finished";

  return {
    id: me.id,
    name: me.name,
    currentTitle: visible ? me.currentTitle : "",
    clicks: visible ? me.clicks : 0,
    path: visible ? me.path : [],
    finishedAt: visible ? me.finishedAt : undefined,
    ready: me.ready,
  };
}
