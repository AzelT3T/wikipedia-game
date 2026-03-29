import { Difficulty } from "./types";
import { fetchRandomGoalTitles } from "./wikipedia";

const MIN_GOAL_POOL_SIZE = 1200;
const GOAL_POOL_CACHE_MS = 10 * 60 * 1000;

interface GoalPoolState {
  pools: Record<Difficulty, string[]>;
  expiresAt: number;
}

declare global {
  var __goalPoolState: GoalPoolState | undefined;
}

let goalPoolState = globalThis.__goalPoolState;
globalThis.__goalPoolState = goalPoolState;

function shuffle<T>(items: T[]): T[] {
  const list = [...items];

  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = list[index];
    list[index] = list[swapIndex];
    list[swapIndex] = current;
  }

  return list;
}

async function buildGoalPools(): Promise<Record<Difficulty, string[]>> {
  const randomGoals = await fetchRandomGoalTitles(MIN_GOAL_POOL_SIZE + 300);

  return {
    easy: shuffle(randomGoals),
    normal: shuffle(randomGoals),
    hard: shuffle(randomGoals),
  };
}

export async function getGoalPool(difficulty: Difficulty): Promise<string[]> {
  if (goalPoolState && goalPoolState.expiresAt > Date.now()) {
    const cachedPool = goalPoolState.pools[difficulty];

    if (Array.isArray(cachedPool) && cachedPool.length >= MIN_GOAL_POOL_SIZE) {
      return cachedPool;
    }
  }

  const pools = await buildGoalPools();
  const nextState: GoalPoolState = {
    pools,
    expiresAt: Date.now() + GOAL_POOL_CACHE_MS,
  };

  goalPoolState = nextState;
  globalThis.__goalPoolState = nextState;

  return nextState.pools[difficulty];
}

export async function pickGoalTitle(difficulty: Difficulty): Promise<string> {
  const pool = await getGoalPool(difficulty);

  if (pool.length === 0) {
    throw new Error("Goal pool is empty");
  }

  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}
