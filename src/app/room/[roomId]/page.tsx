"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArticleNavigator } from "@/components/article-navigator";
import { formatMs, useElapsedMs } from "@/components/time";
import { SerializedRoom } from "@/lib/client-types";

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const router = useRouter();

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [joinName, setJoinName] = useState("Player 2");
  const [room, setRoom] = useState<SerializedRoom | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const playerFromQuery = searchParams.get("player");

    if (playerFromQuery) {
      setPlayerId(playerFromQuery);
      window.localStorage.setItem(`wiki-room-player-${roomId}`, playerFromQuery);
      return;
    }

    const saved = window.localStorage.getItem(`wiki-room-player-${roomId}`);

    if (saved) {
      setPlayerId(saved);
      router.replace(`/room/${roomId}?player=${encodeURIComponent(saved)}`);
    }
  }, [roomId, router]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch(
          `/api/room/${encodeURIComponent(roomId)}${playerId ? `?playerId=${encodeURIComponent(playerId)}` : ""}`,
          { cache: "no-store" }
        );

        const json = await response.json();

        if (!response.ok) {
          throw new Error(json?.error ?? "ルーム取得に失敗しました");
        }

        if (active) {
          setRoom(json);
          setError(null);
        }
      } catch (requestError) {
        if (!active) return;

        const message = requestError instanceof Error ? requestError.message : "ルーム取得に失敗しました";
        setError(message);
      }
    }

    load();
    const timer = window.setInterval(load, 1000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [playerId, roomId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  const me = useMemo(() => {
    if (!room || !playerId) {
      return undefined;
    }

    return room.players.find((player) => player.id === playerId);
  }, [room, playerId]);

  const meWithPath = room?.me;
  const visibleChallenge = room?.challenge;
  const myFinishedAt = room?.leaderboard.find((item) => item.id === playerId)?.finishedAt;
  const myElapsed = useElapsedMs(room?.startAt, myFinishedAt);

  const countdownMs = room?.startAt ? Math.max(0, room.startAt - now) : 0;
  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${roomId}` : `/room/${roomId}`;

  async function joinRoom() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/room/${encodeURIComponent(roomId)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: joinName }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error ?? "ルーム参加に失敗しました");
      }

      const nextPlayerId = json.playerId as string;
      setPlayerId(nextPlayerId);
      window.localStorage.setItem(`wiki-room-player-${roomId}`, nextPlayerId);
      router.replace(`/room/${roomId}?player=${encodeURIComponent(nextPlayerId)}`);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "ルーム参加に失敗しました";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleReady() {
    if (!playerId || !me) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/room/${encodeURIComponent(roomId)}/ready`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, ready: !me.ready }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error ?? "Ready更新に失敗しました");
      }

      setRoom(json.room);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Ready更新に失敗しました";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function move(nextTitle: string) {
    if (!playerId) {
      return;
    }

    const response = await fetch(`/api/room/${encodeURIComponent(roomId)}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, toTitle: nextTitle }),
    });

    const json = await response.json();

    if (!response.ok) {
      throw new Error(json?.error ?? "移動に失敗しました");
    }

    setRoom(json.room);
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
    } catch {
      setError("招待リンクのコピーに失敗しました");
    }
  }

  return (
    <main className="room-page">
      <header className="panel">
        <div className="row-wrap">
          <div>
            <p className="kicker">Versus Mode</p>
            <h1>Room {roomId}</h1>
          </div>
          <Link className="ghost" href="/">
            ホームへ
          </Link>
        </div>

        <div className="row-wrap">
          <button type="button" className="secondary" onClick={copyInviteLink}>
            招待リンクをコピー
          </button>
          <p className="muted">{inviteUrl}</p>
        </div>

        {room && (
          <>
            {visibleChallenge ? (
              <p className="muted">
                Start: {visibleChallenge.startTitle} / Goal: {visibleChallenge.goalTitle} / 難易度: {visibleChallenge.difficulty}
              </p>
            ) : (
              <p className="muted">Start/Goal はレース開始時に公開されます。</p>
            )}
            <p className="muted">あなたのタイム: {formatMs(myElapsed)}</p>
          </>
        )}

        {error && <p className="error">{error}</p>}
      </header>

      {!playerId && room?.status === "waiting" && (
        <section className="panel">
          <p className="label">このルームに参加</p>
          <div className="row-wrap">
            <input
              className="input"
              value={joinName}
              maxLength={20}
              onChange={(event) => setJoinName(event.target.value)}
            />
            <button type="button" className="primary" onClick={joinRoom} disabled={loading || room.players.length >= 2}>
              参加
            </button>
          </div>
        </section>
      )}

      {room && (
        <section className="panel">
          <p className="label">プレイヤー</p>
          <div className="score-grid">
            {room.players.map((player) => {
              const board = room.leaderboard.find((item) => item.id === player.id);
              const isMe = player.id === playerId;

              return (
                <div className={`score-card ${isMe ? "mine" : ""}`} key={player.id}>
                  <h3>{player.name}</h3>
                  <p className="muted">{isMe ? "あなた" : "相手"}</p>
                  <p>Ready: {player.ready ? "Yes" : "No"}</p>
                  <p>Clicks: {player.clicks}</p>
                  <p>
                    Result: {board?.elapsedMs !== null && board?.elapsedMs !== undefined ? formatMs(board.elapsedMs) : "進行中"}
                  </p>
                </div>
              );
            })}
          </div>

          {playerId && me && room.status === "waiting" && (
            <div className="actions">
              <button type="button" className={me.ready ? "ghost" : "primary"} onClick={toggleReady} disabled={loading}>
                {me.ready ? "Ready解除" : "Ready"}
              </button>
            </div>
          )}

          {room.status === "running" && countdownMs > 0 && (
            <p className="success">開始まで: {(countdownMs / 1000).toFixed(1)} 秒</p>
          )}

          {(room.status === "finished" || room.winnerId) && (
            <div>
              <p className="success">
                勝者: {room.leaderboard[0]?.name ?? "-"} ({room.leaderboard[0]?.elapsedMs ? formatMs(room.leaderboard[0].elapsedMs) : "-"})
              </p>
              {meWithPath && (
                <p className="muted">
                  あなたの経路: {meWithPath.path.join(" -> ")}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {room && playerId && meWithPath && visibleChallenge && room.status === "running" && countdownMs <= 0 && !myFinishedAt && (
        <ArticleNavigator
          currentTitle={meWithPath.currentTitle}
          goalTitle={visibleChallenge.goalTitle}
          disabled={!meWithPath.currentTitle}
          onMove={move}
        />
      )}
    </main>
  );
}

