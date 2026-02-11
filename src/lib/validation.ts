import { Difficulty } from "./types";

const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

export function parseDifficulty(value: string | null | undefined): Difficulty {
  if (!value) {
    return "normal";
  }

  if (DIFFICULTIES.includes(value as Difficulty)) {
    return value as Difficulty;
  }

  return "normal";
}

