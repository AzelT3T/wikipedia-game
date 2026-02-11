import { Challenge, Difficulty, RoomStatus } from "./types";

export interface SerializedRoomPlayer {
  id: string;
  name: string;
  ready: boolean;
  joinedAt: number;
  currentTitle: string;
  clicks: number;
  pathLength: number;
  path: string[];
  finishedAt?: number;
}

export interface LeaderboardItem {
  id: string;
  name: string;
  clicks: number;
  finishedAt?: number;
  elapsedMs: number | null;
}

export interface SerializedRoom {
  id: string;
  round: number;
  status: RoomStatus;
  createdAt: number;
  challenge: Challenge | null;
  startAt?: number;
  winnerId?: string;
  players: SerializedRoomPlayer[];
  leaderboard: LeaderboardItem[];
  me?: {
    id: string;
    name: string;
    currentTitle: string;
    clicks: number;
    path: string[];
    finishedAt?: number;
    ready: boolean;
  };
}

export interface CreateRoomResponse {
  room: SerializedRoom;
  roomId: string;
  playerId: string;
  invitePath: string;
  inviteUrl: string;
}

export interface ChallengeRequest {
  difficulty: Difficulty;
}

