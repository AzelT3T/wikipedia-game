# Wiki Link Race

Wikipedia の内部リンクだけを使って `Start -> Goal` へ到達するタイムを競うゲームです。

## Modes

- Solo: 1人でタイムアタック
- Versus: 招待リンクで2人対戦

## Rules

- スタートページとゴールページはサーバーで生成
- ゴールは著名語寄り
- スタートはランダム性が高く、難解語を含む場合あり
- 難易度 (`easy / normal / hard`) に応じて想定リンク距離を調整

## Tech

- Next.js (App Router) + TypeScript
- MediaWiki API (ja.wikipedia.org)
- インメモリのルーム管理 (MVP)

## Run

```bash
npm install
npm run dev
```

Open: `http://localhost:3000`

## Wikipedia Overlay Extension (MV3)

- `extension/` に Chrome/Edge 用の MV3 拡張が含まれています。
- Wikipedia ページ上にソロ/対戦オーバーレイを表示します。
- 読み込み手順は `extension/README.md` を参照してください。

## Build / Lint

```bash
npm run lint
npm run build
```

## Notes

- 対戦ルーム情報はサーバープロセスのメモリに保持されます。
- サーバー再起動でルームは消えます。
- 同時接続や永続化が必要な場合は DB + Realtime へ置き換えてください。
