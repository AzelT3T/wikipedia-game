"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArticleNavigator } from "@/components/article-navigator";
import { formatMs, useElapsedMs } from "@/components/time";
import { Challenge, Difficulty } from "@/lib/types";
import { parseDifficulty } from "@/lib/validation";

function parseChallengeFromQuery(searchParams: URLSearchParams): Challenge | null {
  const startTitle = searchParams.get("start");
  const goalTitle = searchParams.get("goal");

  if (!startTitle || !goalTitle) {
    return null;
  }

  const difficulty = parseDifficulty(searchParams.get("difficulty"));
  const targetDistance = Number(searchParams.get("targetDistance") ?? "0") || 0;

  return {
    startTitle,
    goalTitle,
    difficulty,
    targetDistance,
    generatedAt: Date.now(),
  };
}

export default function SoloPage() {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [startAt, setStartAt] = useState<number | undefined>(undefined);
  const [endAt, setEndAt] = useState<number | undefined>(undefined);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const fromQuery = parseChallengeFromQuery(searchParams);

    if (fromQuery) {
      setChallenge(fromQuery);
      setCurrentTitle(fromQuery.startTitle);
      setPath([fromQuery.startTitle]);
      setStartAt(Date.now());
      setEndAt(undefined);
      setDifficulty(fromQuery.difficulty);
    }
  }, []);

  const elapsedMs = useElapsedMs(startAt, endAt);

  const progressText = useMemo(() => {
    if (!challenge) {
      return "問題を生成してください";
    }

    return `クリック数 ${Math.max(path.length - 1, 0)} / 目安 ${challenge.targetDistance}`;
  }, [challenge, path.length]);

  async function generateChallenge(nextDifficulty = difficulty) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty: nextDifficulty }),
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error ?? "問題生成に失敗しました");
      }

      setChallenge(json);
      setCurrentTitle(json.startTitle);
      setPath([json.startTitle]);
      setStartAt(Date.now());
      setEndAt(undefined);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "問題生成に失敗しました";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function move(nextTitle: string) {
    if (!challenge || endAt) {
      return;
    }

    setCurrentTitle(nextTitle);
    setPath((previous) => [...previous, nextTitle]);

    if (nextTitle === challenge.goalTitle) {
      setEndAt(Date.now());
    }
  }

  const isFinished = Boolean(challenge && currentTitle === challenge.goalTitle);

  return (
    <main className="solo">
      <header className="panel">
        <div className="row-wrap">
          <div>
            <p className="kicker">Solo Mode</p>
            <h1>タイムアタック</h1>
          </div>
          <Link className="ghost" href="/">
            ホームへ
          </Link>
        </div>

        <div className="row-wrap">
          <div>
            <p className="label">難易度</p>
            <div className="difficulty-group">
              {(["easy", "normal", "hard"] as Difficulty[]).map((item) => (
                <button
                  key={item}
                  className={`chip ${difficulty === item ? "active" : ""}`}
                  type="button"
                  onClick={() => setDifficulty(item)}
                  disabled={loading}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="timer-box">
            <p className="label">タイム</p>
            <p className="timer">{formatMs(elapsedMs)}</p>
            <p className="muted">{progressText}</p>
          </div>
        </div>

        <div className="actions">
          <button type="button" className="primary" onClick={() => generateChallenge(difficulty)} disabled={loading}>
            {loading ? "生成中..." : "新しい問題を生成"}
          </button>
        </div>

        {isFinished && (
          <p className="success">
            ゴール到達! 記録: <strong>{formatMs(elapsedMs)}</strong>
          </p>
        )}

        {challenge && (
          <p className="muted">
            Start: {challenge.startTitle} / Goal: {challenge.goalTitle} / 難易度: {challenge.difficulty}
          </p>
        )}

        {error && <p className="error">{error}</p>}
      </header>

      {challenge && currentTitle && (
        <ArticleNavigator
          currentTitle={currentTitle}
          goalTitle={challenge.goalTitle}
          disabled={Boolean(endAt)}
          onMove={move}
        />
      )}
    </main>
  );
}

