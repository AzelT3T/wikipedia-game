import { getGoalPool } from "./goal-pool";
import { Challenge, Difficulty } from "./types";
import { pickOne } from "./utils";
import { fetchBacklinks, fetchRandomTitle, hasPathWithinDepth } from "./wikipedia";

interface DifficultyConfig {
  distanceCandidates: number[];
  minDistance: number;
}

const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: { distanceCandidates: [2, 3], minDistance: 2 },
  normal: { distanceCandidates: [4, 5], minDistance: 4 },
  hard: { distanceCandidates: [6, 7, 8], minDistance: 6 },
};

const CHALLENGE_TIME_BUDGET_MS = 11_000;
const GOAL_RECENT_WINDOW = 20;

interface GoalCache {
  lastGoalByDifficulty: Record<Difficulty, string>;
  recentGoalsByDifficulty: Record<Difficulty, string[]>;
  goalUseCountByDifficulty: Record<Difficulty, Record<string, number>>;
}

declare global {
  var __goalCache: GoalCache | undefined;
}

const goalCache =
  globalThis.__goalCache ?? {
    lastGoalByDifficulty: {
      easy: "",
      normal: "",
      hard: "",
    },
    recentGoalsByDifficulty: {
      easy: [],
      normal: [],
      hard: [],
    },
    goalUseCountByDifficulty: {
      easy: {},
      normal: {},
      hard: {},
    },
  };

if (!goalCache.lastGoalByDifficulty) {
  goalCache.lastGoalByDifficulty = {
    easy: "",
    normal: "",
    hard: "",
  };
}

if (!goalCache.recentGoalsByDifficulty) {
  goalCache.recentGoalsByDifficulty = {
    easy: [],
    normal: [],
    hard: [],
  };
}

if (!goalCache.goalUseCountByDifficulty) {
  goalCache.goalUseCountByDifficulty = {
    easy: {},
    normal: {},
    hard: {},
  };
}

globalThis.__goalCache = goalCache;

function normalizeTitle(title: string): string {
  return title.replace(/_/g, " ").trim();
}

function pickLessUsedGoal(difficulty: Difficulty, candidates: string[]): string {
  const usage = goalCache.goalUseCountByDifficulty[difficulty];
  let minimumUse = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const count = usage[normalizeTitle(candidate)] ?? 0;

    if (count < minimumUse) {
      minimumUse = count;
    }
  }

  const leastUsed = candidates.filter(
    (candidate) => (usage[normalizeTitle(candidate)] ?? 0) === minimumUse
  );

  return pickOne(leastUsed);
}

function rememberGoalSelection(difficulty: Difficulty, goalTitle: string) {
  const normalizedGoal = normalizeTitle(goalTitle);
  const usage = goalCache.goalUseCountByDifficulty[difficulty];
  const previousRecent = goalCache.recentGoalsByDifficulty[difficulty];
  const nextRecent = previousRecent.filter((title) => normalizeTitle(title) !== normalizedGoal);

  nextRecent.push(normalizedGoal);

  while (nextRecent.length > GOAL_RECENT_WINDOW) {
    nextRecent.shift();
  }

  usage[normalizedGoal] = (usage[normalizedGoal] ?? 0) + 1;
  goalCache.recentGoalsByDifficulty[difficulty] = nextRecent;
  goalCache.lastGoalByDifficulty[difficulty] = normalizedGoal;
}

async function generateBacklinkChain(goalTitle: string, distance: number): Promise<string[] | null> {
  const path = [goalTitle];
  const used = new Set<string>([goalTitle]);

  while (path.length < distance + 1) {
    const currentTarget = path[0];
    const backlinks = await fetchBacklinks(currentTarget, 180);
    const candidates = backlinks.filter((title) => !used.has(title));

    if (candidates.length === 0) {
      return null;
    }

    const next = pickOne(candidates);
    used.add(next);
    path.unshift(next);
  }

  return path;
}

async function pickExistingGoalTitle(
  difficulty: Difficulty,
  excludedGoals: Set<string> = new Set<string>()
): Promise<string | null> {
  const pool = await getGoalPool(difficulty);
  const availablePool = pool.filter((title) => !excludedGoals.has(normalizeTitle(title)));

  if (availablePool.length > 0) {
    return pickLessUsedGoal(difficulty, availablePool);
  }

  if (pool.length > 0) {
    return pickLessUsedGoal(difficulty, pool);
  }

  return null;
}

export function difficultyDistanceLabel(difficulty: Difficulty): string {
  const config = DIFFICULTY_CONFIG[difficulty];
  const min = Math.min(...config.distanceCandidates);
  const max = Math.max(...config.distanceCandidates);

  return `${min}-${max} hops`;
}

interface GenerateChallengeOptions {
  excludeGoalTitles?: string[];
}

export async function generateChallenge(
  difficulty: Difficulty,
  options: GenerateChallengeOptions = {}
): Promise<Challenge> {
  const config = DIFFICULTY_CONFIG[difficulty];
  const deadline = Date.now() + CHALLENGE_TIME_BUDGET_MS;
  const explicitExcludedGoals = new Set(
    (options.excludeGoalTitles ?? []).map((title) => normalizeTitle(String(title)))
  );
  const excludedGoals = new Set<string>([
    ...explicitExcludedGoals,
    ...goalCache.recentGoalsByDifficulty[difficulty].map((title) => normalizeTitle(title)),
  ]);
  const previousGoal = normalizeTitle(goalCache.lastGoalByDifficulty[difficulty] || "");

  if (previousGoal) {
    excludedGoals.add(previousGoal);
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (Date.now() > deadline) {
      break;
    }

    const goalTitle = await pickExistingGoalTitle(difficulty, excludedGoals);

    if (!goalTitle) {
      continue;
    }

    const targetDistance = pickOne(config.distanceCandidates);
    const chain = await generateBacklinkChain(goalTitle, targetDistance);

    if (!chain) {
      continue;
    }

    const startTitle = chain[0];

    if (startTitle === goalTitle) {
      continue;
    }

    const shouldRunDistanceGuard = difficulty === "easy";

    if (shouldRunDistanceGuard && config.minDistance > 1) {
      const hasShorterPath = await hasPathWithinDepth(
        startTitle,
        goalTitle,
        config.minDistance - 1,
        260
      );

      if (hasShorterPath) {
        continue;
      }
    }

    rememberGoalSelection(difficulty, goalTitle);

    return {
      startTitle,
      goalTitle,
      difficulty,
      targetDistance,
      generatedAt: Date.now(),
    };
  }

  let fallbackGoal = (
    await pickExistingGoalTitle(difficulty, excludedGoals)
  ) ?? null;

  if (!fallbackGoal && excludedGoals.size > 0) {
    const relaxedExcludedGoals = new Set(explicitExcludedGoals);

    if (previousGoal) {
      relaxedExcludedGoals.add(previousGoal);
    }

    fallbackGoal = await pickExistingGoalTitle(difficulty, relaxedExcludedGoals);
  }

  if (!fallbackGoal) {
    fallbackGoal = await pickExistingGoalTitle(difficulty, new Set<string>());
  }

  fallbackGoal = fallbackGoal ?? "Wikipedia";
  rememberGoalSelection(difficulty, fallbackGoal);
  let fallbackStart = await fetchRandomTitle();

  for (let attempt = 0; attempt < 6 && fallbackStart === fallbackGoal; attempt += 1) {
    fallbackStart = await fetchRandomTitle();
  }

  return {
    startTitle: fallbackStart,
    goalTitle: fallbackGoal,
    difficulty,
    targetDistance: Math.min(...config.distanceCandidates),
    generatedAt: Date.now(),
  };
}
