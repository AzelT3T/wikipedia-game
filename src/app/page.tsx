"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Difficulty } from "@/lib/types";
import { CreateRoomResponse } from "@/lib/client-types";

const DIFFICULTIES: Array<{ value: Difficulty; label: string; description: string }> = [
  { value: "easy", label: "Easy", description: "推定2-3リンク。短め" },
  { value: "normal", label: "Normal", description: "推定4-5リンク。標準" },
  { value: "hard", label: "Hard", description: "推定6-8リンク。長め" },
];

export default function Home() {
  const router = useRouter();
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [name, setName] = useState("Player 1");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [loading, setLoading] = useState<"solo" | "room" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => DIFFICULTIES.find((item) => item.value === difficulty) ?? DIFFICULTIES[1],
    [difficulty]
  );

  async function startSolo() {
    setLoading("solo");
    setError(null);

    try {
      const response = await fetch("/api/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty }),
      });
      const challenge = await response.json();

      if (!response.ok) {
        throw new Error(challenge?.error ?? "ソロゲームの生成に失敗しました");
      }

      const query = new URLSearchParams({
        start: challenge.startTitle,
        goal: challenge.goalTitle,
        difficulty: challenge.difficulty,
        targetDistance: String(challenge.targetDistance),
      });

      router.push(`/solo?${query.toString()}`);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "ソロゲームの生成に失敗しました";
      setError(message);
    } finally {
      setLoading(null);
    }
  }

  async function createRoomAndStart() {
    setLoading("room");
    setError(null);

    try {
      const response = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty, name }),
      });

      const json = (await response.json()) as CreateRoomResponse & { error?: string };

      if (!response.ok) {
        throw new Error(json?.error ?? "ルーム作成に失敗しました");
      }

      router.push(`/room/${json.roomId}?player=${encodeURIComponent(json.playerId)}`);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "ルーム作成に失敗しました";
      setError(message);
    } finally {
      setLoading(null);
    }
  }

  function openJoinRoom() {
    const roomId = joinRoomId.trim();

    if (!roomId) {
      setError("ルームIDを入力してください");
      return;
    }

    router.push(`/room/${encodeURIComponent(roomId)}`);
  }

  return (
    <main className="home">
      <section className="hero">
        <p className="kicker">Wikipedia Game</p>
        <h1>Wiki Link Race</h1>
        <p className="muted">
          スタート記事からゴール記事まで、Wikipedia内部リンクだけで到達するタイムを競うゲームです。
          <br />
          ゴールは著名語寄り、スタートは難解語を含むランダム性を持たせています。
        </p>
      </section>

      <section className="panel">
        <div className="row-wrap">
          <div>
            <p className="label">難易度</p>
            <div className="difficulty-group">
              {DIFFICULTIES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`chip ${difficulty === item.value ? "active" : ""}`}
                  onClick={() => setDifficulty(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="muted">{selected.description}</p>
          </div>

          <div className="name-box">
            <label htmlFor="playerName" className="label">
              名前(対戦用)
            </label>
            <input
              id="playerName"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={20}
            />
          </div>
        </div>

        <div className="actions">
          <button type="button" className="primary" onClick={startSolo} disabled={loading !== null}>
            {loading === "solo" ? "問題生成中..." : "ソロ開始"}
          </button>
          <button type="button" className="secondary" onClick={createRoomAndStart} disabled={loading !== null}>
            {loading === "room" ? "ルーム作成中..." : "対戦ルーム作成"}
          </button>
        </div>

        <div className="join-box">
          <p className="label">招待リンクで参加</p>
          <div className="row-wrap">
            <input
              className="input"
              placeholder="ルームID (例: ab12cd)"
              value={joinRoomId}
              onChange={(event) => setJoinRoomId(event.target.value)}
            />
            <button type="button" className="ghost" onClick={openJoinRoom}>
              参加画面へ
            </button>
          </div>
        </div>

        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}

