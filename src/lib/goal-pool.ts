import { Difficulty } from "./types";

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

const GOAL_POOL: Record<Difficulty, string[]> = {
  easy: EASY_GOALS,
  normal: NORMAL_GOALS,
  hard: HARD_GOALS,
};

export function getGoalPool(difficulty: Difficulty): string[] {
  return GOAL_POOL[difficulty];
}

export function pickGoalTitle(difficulty: Difficulty): string {
  const pool = GOAL_POOL[difficulty];
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

