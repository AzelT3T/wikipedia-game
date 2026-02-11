"use client";

import { useEffect, useMemo, useState } from "react";
import { ArticleSnapshot } from "@/lib/types";

interface ArticleNavigatorProps {
  currentTitle: string;
  goalTitle: string;
  disabled?: boolean;
  onMove: (nextTitle: string) => Promise<void> | void;
}

export function ArticleNavigator({ currentTitle, goalTitle, disabled, onMove }: ArticleNavigatorProps) {
  const [article, setArticle] = useState<ArticleSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [submittingTitle, setSubmittingTitle] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadArticle() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/article?title=${encodeURIComponent(currentTitle)}`, {
          signal: controller.signal,
        });

        const json = await response.json();

        if (!response.ok) {
          throw new Error(json?.error ?? "ページの取得に失敗しました");
        }

        if (active) {
          setArticle(json);
        }
      } catch (requestError) {
        if (!active) return;

        const message = requestError instanceof Error ? requestError.message : "ページの取得に失敗しました";
        setError(message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadArticle();

    return () => {
      active = false;
      controller.abort();
    };
  }, [currentTitle]);

  const filteredLinks = useMemo(() => {
    if (!article) {
      return [];
    }

    const keyword = filter.trim().toLowerCase();

    if (!keyword) {
      return article.links.slice(0, 120);
    }

    return article.links.filter((title) => title.toLowerCase().includes(keyword)).slice(0, 120);
  }, [article, filter]);

  async function move(nextTitle: string) {
    if (disabled || submittingTitle) {
      return;
    }

    try {
      setSubmittingTitle(nextTitle);
      await onMove(nextTitle);
      setFilter("");
    } finally {
      setSubmittingTitle(null);
    }
  }

  return (
    <div className="panel">
      <div className="row-wrap">
        <div>
          <p className="label">現在ページ</p>
          <h2>{currentTitle}</h2>
        </div>
        <a className="wiki-link" href={`https://ja.wikipedia.org/wiki/${encodeURIComponent(currentTitle.replace(/ /g, "_"))}`} target="_blank" rel="noreferrer">
          Wikipediaで開く
        </a>
      </div>

      <p className="goal-line">ゴール: <strong>{goalTitle}</strong></p>

      {loading && <p className="muted">ページを読み込み中...</p>}
      {error && <p className="error">{error}</p>}

      {article && (
        <>
          <p className="extract">{article.extract}</p>

          <div className="links-head">
            <p className="label">内部リンク ({article.links.length})</p>
            <input
              className="input"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="リンクを検索"
              disabled={Boolean(disabled)}
            />
          </div>

          <div className="links-grid">
            {filteredLinks.map((title) => (
              <button
                key={title}
                className="link-button"
                type="button"
                disabled={Boolean(disabled) || submittingTitle === title}
                onClick={() => move(title)}
              >
                {title}
              </button>
            ))}

            {filteredLinks.length === 0 && <p className="muted">一致するリンクがありません。</p>}
          </div>
        </>
      )}
    </div>
  );
}

