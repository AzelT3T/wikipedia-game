import { getGoalPool } from "./goal-pool";
import { Challenge, Difficulty } from "./types";
import { pickOne } from "./utils";
import { fetchArticleSnapshot, fetchBacklinks, fetchRandomTitle, hasPathWithinDepth } from "./wikipedia";

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

interface GoalCache {
  verifiedByDifficulty: Record<Difficulty, Set<string>>;
}

declare global {
  var __goalCache: GoalCache | undefined;
}

const goalCache =
  globalThis.__goalCache ?? {
    verifiedByDifficulty: {
      easy: new Set<string>(),
      normal: new Set<string>(),
      hard: new Set<string>(),
    },
  };

globalThis.__goalCache = goalCache;

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

async function resolveCanonicalGoalTitle(goalTitle: string): Promise<string | null> {
  try {
    const article = await fetchArticleSnapshot(goalTitle, 8);
    return article.title;
  } catch {
    return null;
  }
}

async function pickExistingGoalTitle(difficulty: Difficulty, deadline: number): Promise<string | null> {
  const verified = goalCache.verifiedByDifficulty[difficulty];

  if (verified.size > 0) {
    return pickOne([...verified]);
  }

  const pool = getGoalPool(difficulty);
  const attempted = new Set<string>();

  for (let index = 0; index < 7; index += 1) {
    if (Date.now() > deadline) {
      break;
    }

    const candidate = pickOne(pool);

    if (attempted.has(candidate)) {
      continue;
    }

    attempted.add(candidate);
    const canonical = await resolveCanonicalGoalTitle(candidate);

    if (canonical) {
      verified.add(canonical);
      return canonical;
    }
  }

  if (verified.size > 0) {
    return pickOne([...verified]);
  }

  return null;
}

export function difficultyDistanceLabel(difficulty: Difficulty): string {
  const config = DIFFICULTY_CONFIG[difficulty];
  const min = Math.min(...config.distanceCandidates);
  const max = Math.max(...config.distanceCandidates);

  return `${min}-${max} hops`;
}

export async function generateChallenge(difficulty: Difficulty): Promise<Challenge> {
  const config = DIFFICULTY_CONFIG[difficulty];
  const deadline = Date.now() + CHALLENGE_TIME_BUDGET_MS;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (Date.now() > deadline) {
      break;
    }

    const goalTitle = await pickExistingGoalTitle(difficulty, deadline);

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

    return {
      startTitle,
      goalTitle,
      difficulty,
      targetDistance,
      generatedAt: Date.now(),
    };
  }

  const fallbackGoal = (await pickExistingGoalTitle(difficulty, Date.now() + 1_500)) ?? "Wikipedia";
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
