export type Difficulty = "easy" | "normal" | "hard";

export type RoomStatus = "waiting" | "running" | "finished";

export interface Challenge {
  startTitle: string;
  goalTitle: string;
  difficulty: Difficulty;
  targetDistance: number;
  generatedAt: number;
}

export interface ArticleSnapshot {
  title: string;
  extract: string;
  links: string[];
  url: string;
}

export interface RoomPlayer {
  id: string;
  name: string;
  ready: boolean;
  joinedAt: number;
  currentTitle: string;
  clicks: number;
  path: string[];
  finishedAt?: number;
}

export interface Room {
  id: string;
  round: number;
  status: RoomStatus;
  createdAt: number;
  challenge: Challenge;
  players: Record<string, RoomPlayer>;
  startAt?: number;
  winnerId?: string;
}

