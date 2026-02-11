import { Challenge, Room, RoomPlayer } from "./types";

const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const START_DELAY_MS = 4000;

interface RoomStore {
  rooms: Map<string, Room>;
}

declare global {
  var __roomStore: RoomStore | undefined;
}

const store = globalThis.__roomStore ?? { rooms: new Map<string, Room>() };
globalThis.__roomStore = store;

function cleanupRooms() {
  const now = Date.now();

  for (const [roomId, room] of store.rooms.entries()) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      store.rooms.delete(roomId);
    }
  }
}

function newId(length: number): string {
  return Math.random().toString(36).slice(2, 2 + length);
}

function createRoomId(): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = newId(6);

    if (!store.rooms.has(candidate)) {
      return candidate;
    }
  }

  return `${newId(4)}${Date.now().toString(36).slice(-4)}`;
}

function createPlayer(name: string, startTitle: string): RoomPlayer {
  const safeName = name.trim().slice(0, 20) || "Player";

  return {
    id: crypto.randomUUID(),
    name: safeName,
    ready: false,
    joinedAt: Date.now(),
    currentTitle: startTitle,
    clicks: 0,
    path: [startTitle],
  };
}

export function createRoom(challenge: Challenge, creatorName: string) {
  cleanupRooms();

  const roomId = createRoomId();
  const creator = createPlayer(creatorName, challenge.startTitle);

  const room: Room = {
    id: roomId,
    round: 1,
    status: "waiting",
    createdAt: Date.now(),
    challenge,
    players: {
      [creator.id]: creator,
    },
  };

  store.rooms.set(roomId, room);

  return { room, player: creator };
}

export function getRoom(roomId: string): Room | undefined {
  cleanupRooms();
  return store.rooms.get(roomId);
}

export function joinRoom(roomId: string, name: string): RoomPlayer {
  const room = getRoom(roomId);

  if (!room) {
    throw new Error("ROOM_NOT_FOUND");
  }

  if (room.status !== "waiting") {
    throw new Error("ROOM_ALREADY_STARTED");
  }

  const players = Object.values(room.players);

  if (players.length >= 2) {
    throw new Error("ROOM_FULL");
  }

  const newPlayer = createPlayer(name, room.challenge.startTitle);
  room.players[newPlayer.id] = newPlayer;

  return newPlayer;
}

export function setPlayerReady(roomId: string, playerId: string, ready: boolean): Room {
  const room = getRoom(roomId);

  if (!room) {
    throw new Error("ROOM_NOT_FOUND");
  }

  const player = room.players[playerId];

  if (!player) {
    throw new Error("PLAYER_NOT_FOUND");
  }

  if (room.status !== "waiting") {
    return room;
  }

  player.ready = ready;

  const players = Object.values(room.players);

  if (players.length >= 2 && players.every((item) => item.ready)) {
    room.status = "running";
    room.startAt = Date.now() + START_DELAY_MS;

    for (const roomPlayer of players) {
      roomPlayer.currentTitle = room.challenge.startTitle;
      roomPlayer.clicks = 0;
      roomPlayer.path = [room.challenge.startTitle];
      roomPlayer.finishedAt = undefined;
    }
  }

  return room;
}

export function applyPlayerMove(roomId: string, playerId: string, nextTitle: string): Room {
  const room = getRoom(roomId);

  if (!room) {
    throw new Error("ROOM_NOT_FOUND");
  }

  if (room.status !== "running") {
    throw new Error("ROOM_NOT_RUNNING");
  }

  if (!room.startAt || Date.now() < room.startAt) {
    throw new Error("RACE_NOT_STARTED");
  }

  const player = room.players[playerId];

  if (!player) {
    throw new Error("PLAYER_NOT_FOUND");
  }

  if (player.finishedAt) {
    return room;
  }

  player.currentTitle = nextTitle;
  player.clicks += 1;
  player.path.push(nextTitle);

  if (nextTitle === room.challenge.goalTitle) {
    player.finishedAt = Date.now();

    if (!room.winnerId) {
      room.winnerId = player.id;
      room.status = "finished";
    }
  }

  return room;
}

export function roomLeaderboard(room: Room) {
  return Object.values(room.players)
    .map((player) => {
      const elapsedMs = room.startAt && player.finishedAt ? player.finishedAt - room.startAt : null;

      return {
        id: player.id,
        name: player.name,
        clicks: player.clicks,
        finishedAt: player.finishedAt,
        elapsedMs,
      };
    })
    .sort((a, b) => {
      if (a.elapsedMs === null && b.elapsedMs === null) return a.name.localeCompare(b.name);
      if (a.elapsedMs === null) return 1;
      if (b.elapsedMs === null) return -1;
      return a.elapsedMs - b.elapsedMs;
    });
}

export function startNextRound(roomId: string, playerId: string, challenge: Challenge): Room {
  const room = getRoom(roomId);

  if (!room) {
    throw new Error("ROOM_NOT_FOUND");
  }

  if (!room.players[playerId]) {
    throw new Error("PLAYER_NOT_FOUND");
  }

  if (room.status === "running") {
    throw new Error("ROOM_IN_PROGRESS");
  }

  room.round += 1;
  room.status = "waiting";
  room.challenge = challenge;
  room.startAt = undefined;
  room.winnerId = undefined;

  for (const player of Object.values(room.players)) {
    player.ready = false;
    player.currentTitle = challenge.startTitle;
    player.clicks = 0;
    player.path = [challenge.startTitle];
    player.finishedAt = undefined;
  }

  return room;
}

