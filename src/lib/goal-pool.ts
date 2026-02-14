import { Difficulty } from "./types";
import { unique } from "./utils";
import { fetchExpandedGoalTitles } from "./wikipedia";

const EASY_GOALS = [
  "日本",
  "東京",
  "大阪市",
  "北海道",
  "富士山",
  "地球",
  "太陽",
  "月",
  "海",
  "猫",
  "犬",
  "サッカー",
  "野球",
  "アニメ",
  "漫画",
  "音楽",
  "映画",
  "インターネット",
  "スマートフォン",
  "自動車",
  "新幹線",
  "寿司",
  "ラーメン",
  "ドラえもん",
  "ポケットモンスター",
  "スタジオジブリ",
  "任天堂",
  "YouTube",
  "Wikipedia",
  "人工知能",
];

const NORMAL_GOALS = [
  "アメリカ合衆国",
  "フランス",
  "中華人民共和国",
  "第二次世界大戦",
  "江戸時代",
  "明治維新",
  "源頼朝",
  "織田信長",
  "徳川家康",
  "坂本龍馬",
  "夏目漱石",
  "村上春樹",
  "手塚治虫",
  "新世紀エヴァンゲリオン",
  "鬼滅の刃",
  "ONE PIECE",
  "機動戦士ガンダム",
  "Jリーグ",
  "メジャーリーグベースボール",
  "東京大学",
  "京都大学",
  "ビットコイン",
  "量子力学",
  "相対性理論",
  "ブラックホール",
  "Apple",
  "Google",
  "OpenAI",
  "宇宙開発",
  "オリンピック",
];

const HARD_GOALS = [
  "アラン・チューリング",
  "冪等性",
  "量子コンピュータ",
  "深層学習",
  "ゲーム理論",
  "暗号理論",
  "微分方程式",
  "一般相対性理論",
  "中世ヨーロッパ",
  "ビザンツ帝国",
  "産業革命",
  "冷戦",
  "国際連合",
  "欧州連合",
  "世界貿易機関",
  "多国籍企業",
  "サプライチェーン",
  "再生可能エネルギー",
  "ゲノム編集",
  "タンパク質",
  "神経科学",
  "認知科学",
  "言語学",
  "比較文学",
  "浮世絵",
  "現代建築",
  "クラシック音楽",
  "映画理論",
  "データベース",
  "分散システム",
];

const MIN_GOAL_POOL_SIZE = 1200;
const GOAL_POOL_CACHE_MS = 30 * 60 * 1000;

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

function ensurePoolSize(pool: string[], fallback: string[]): string[] {
  if (pool.length >= MIN_GOAL_POOL_SIZE) {
    return pool;
  }

  return unique([...pool, ...fallback]);
}

async function buildGoalPools(): Promise<Record<Difficulty, string[]>> {
  const expanded = await fetchExpandedGoalTitles(MIN_GOAL_POOL_SIZE + 300);
  const randomExpanded = shuffle(expanded);
  const commonSeed = unique([...EASY_GOALS, ...NORMAL_GOALS, ...HARD_GOALS]);

  const easy = ensurePoolSize(
    unique([...EASY_GOALS, ...NORMAL_GOALS, ...randomExpanded, ...commonSeed]),
    randomExpanded
  );
  const normal = ensurePoolSize(
    unique([...NORMAL_GOALS, ...HARD_GOALS, ...randomExpanded, ...commonSeed]),
    randomExpanded
  );
  const hard = ensurePoolSize(
    unique([...HARD_GOALS, ...randomExpanded, ...NORMAL_GOALS, ...commonSeed]),
    randomExpanded
  );

  return {
    easy,
    normal,
    hard,
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
