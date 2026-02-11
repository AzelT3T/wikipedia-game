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
const GOAL_CACHE_TARGET_SIZE = 8;
const GOAL_VERIFY_ATTEMPTS_PER_CALL = 4;

interface GoalCache {
  verifiedByDifficulty: Record<Difficulty, Set<string>>;
  lastGoalByDifficulty: Record<Difficulty, string>;
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
    lastGoalByDifficulty: {
      easy: "",
      normal: "",
      hard: "",
    },
  };

if (!goalCache.lastGoalByDifficulty) {
  goalCache.lastGoalByDifficulty = {
    easy: "",
    normal: "",
    hard: "",
  };
}

globalThis.__goalCache = goalCache;

function normalizeTitle(title: string): string {
  return title.replace(/_/g, " ").trim();
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

async function resolveCanonicalGoalTitle(goalTitle: string): Promise<string | null> {
  try {
    const article = await fetchArticleSnapshot(goalTitle, 8);
    return article.title;
  } catch {
    return null;
  }
}

async function pickExistingGoalTitle(
  difficulty: Difficulty,
  deadline: number,
  excludedGoals: Set<string> = new Set<string>()
): Promise<string | null> {
  const verified = goalCache.verifiedByDifficulty[difficulty];
  const pool = getGoalPool(difficulty);
  const attempted = new Set<string>();
  const shouldGrowCache = verified.size < GOAL_CACHE_TARGET_SIZE;
  const maxAttempts = Math.min(
    pool.length,
    shouldGrowCache ? GOAL_VERIFY_ATTEMPTS_PER_CALL + 2 : GOAL_VERIFY_ATTEMPTS_PER_CALL
  );

  for (let index = 0; index < maxAttempts; index += 1) {
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
    }
  }

  const verifiedOptions = [...verified].filter((title) => !excludedGoals.has(normalizeTitle(title)));

  if (verifiedOptions.length > 0) {
    return pickOne(verifiedOptions);
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
  const excludedGoals = new Set(
    (options.excludeGoalTitles ?? []).map((title) => normalizeTitle(String(title)))
  );
  const previousGoal = normalizeTitle(goalCache.lastGoalByDifficulty[difficulty] || "");

  if (previousGoal) {
    excludedGoals.add(previousGoal);
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (Date.now() > deadline) {
      break;
    }

    const goalTitle = await pickExistingGoalTitle(difficulty, deadline, excludedGoals);

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

    goalCache.lastGoalByDifficulty[difficulty] = goalTitle;

    return {
      startTitle,
      goalTitle,
      difficulty,
      targetDistance,
      generatedAt: Date.now(),
    };
  }

  let fallbackGoal = (
    await pickExistingGoalTitle(difficulty, Date.now() + 1_500, excludedGoals)
  ) ?? null;

  if (!fallbackGoal && excludedGoals.size > 0) {
    fallbackGoal = await pickExistingGoalTitle(difficulty, Date.now() + 1_000, new Set<string>());
  }

  fallbackGoal = fallbackGoal ?? "Wikipedia";
  goalCache.lastGoalByDifficulty[difficulty] = fallbackGoal;
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
