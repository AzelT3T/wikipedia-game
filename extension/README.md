# ブラウザ拡張 (MV3)

このフォルダには、`ja.wikipedia.org` の記事ページ上に `Wiki Link Race` オーバーレイを表示する Chrome/Edge 拡張が入っています。

## ファイル

- `manifest.json`: MV3マニフェスト
- `background.js`: APIプロキシ用 service worker
- `content.js`: オーバーレイUIとゲーム処理

## Load Unpacked 手順

1. アプリを起動
   - `npm run dev`
2. Chromium系ブラウザで
   - `chrome://extensions` (または `edge://extensions`) を開く
3. **Developer mode** をON
4. **Load unpacked** で `extension/` を選択
5. 例として
   - `https://ja.wikipedia.org/wiki/Wikipedia` を開く

## 初期設定

1. オーバーレイの `APIベースURL` を設定（通常 `http://localhost:3000`）
2. `プレイヤー名` を入力
3. `保存`

`https://*.trycloudflare.com` は manifest に許可済みなので、Cloudflare Tunnel のURLも利用できます。
`https://*.herokuapp.com` も許可済みです。

## 遊び方

- ソロ
  - 難易度を選択して `問題生成` -> `開始ページへ`
  - スタート記事に到達すると計測開始
  - 内部リンクのみでゴール記事へ到達
- 対戦
  - `ルーム作成` か `参加`
  - 2人とも `Ready`
  - 開始まで `スタート/ゴール` は非表示
  - 開始時に開始ページへ自動遷移（必要なら手動で `開始ページへ`）
  - 1ラウンド終了後は `次ラウンド` で同一ルームのまま再戦

## 注意

- オーバーレイ状態は `chrome.storage.local` に保存されます。
- ルーム情報は現状サーバーのメモリ保存です。
- サーバー再起動でルームは消えます。
