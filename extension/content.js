/* global chrome */

(() => {
  const STORAGE_KEY = "wiki_link_race_overlay_state_v1";
  const DEFAULT_API_BASE = "http://localhost:3000";
  const HOST_ID = "wiki-link-race-overlay-host";
  const DIFFICULTIES = ["easy", "normal", "hard"];

  const defaultState = {
    settings: {
      apiBaseUrl: DEFAULT_API_BASE,
      playerName: "プレイヤー",
    },
    ui: {
      collapsed: false,
      busy: "",
      notice: "",
      error: "",
    },
    solo: {
      difficulty: "normal",
      challenge: null,
      phase: "idle",
      startedAt: null,
      finishedAt: null,
      lastTitle: "",
      path: [],
    },
    versus: {
      difficulty: "normal",
      active: false,
      roomId: "",
      playerId: "",
      room: null,
      joinRoomId: "",
      localPath: [],
      localLastTitle: "",
      localFinishedAt: null,
      round: 0,
      autoJumpedRound: 0,
    },
  };

  let state = null;
  let shadowRoot = null;
  let roomPollTimer = null;
  let liveTimer = null;
  let refreshInFlight = false;

  boot().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Wiki Link Race overlay boot failed:", message);
  });

  async function boot() {
    if (!isWikiArticlePath(window.location.pathname)) {
      return;
    }

    state = normalizeState(await loadState());
    await handlePageVisit();
    mount();
    render();
    startTimers();
  }

  function isWikiArticlePath(pathname) {
    return typeof pathname === "string" && pathname.startsWith("/wiki/");
  }

  function currentTitleFromLocation() {
    if (!isWikiArticlePath(window.location.pathname)) {
      return "";
    }

    const raw = window.location.pathname.replace(/^\/wiki\//, "");

    if (!raw) {
      return "";
    }

    try {
      return decodeURIComponent(raw).replace(/_/g, " ");
    } catch {
      return raw.replace(/_/g, " ");
    }
  }

  function articleUrl(title) {
    const slug = encodeURIComponent(String(title).replace(/ /g, "_"));
    return `https://ja.wikipedia.org/wiki/${slug}`;
  }

  function titleFromWikiUrl(urlLike) {
    if (typeof urlLike !== "string" || !urlLike) {
      return "";
    }

    try {
      const parsed = new URL(urlLike, window.location.origin);

      if (!isWikiArticlePath(parsed.pathname)) {
        return "";
      }

      const raw = parsed.pathname.replace(/^\/wiki\//, "");

      if (!raw) {
        return "";
      }

      return decodeURIComponent(raw).replace(/_/g, " ");
    } catch {
      return "";
    }
  }

  function currentReferrerTitle() {
    return titleFromWikiUrl(document.referrer);
  }

  function getMyPlayerFromRoom(room) {
    if (!room || !Array.isArray(room.players) || !state.versus.playerId) {
      return null;
    }

    return room.players.find((player) => player.id === state.versus.playerId) ?? null;
  }

  function roomSignature(room) {
    if (!room) {
      return "";
    }

    try {
      return JSON.stringify(room);
    } catch {
      return "";
    }
  }

  function nowMs() {
    return Date.now();
  }

  function sanitizeDifficulty(value) {
    return DIFFICULTIES.includes(value) ? value : "normal";
  }

  function normalizeState(raw) {
    const next = JSON.parse(JSON.stringify(defaultState));

    if (!raw || typeof raw !== "object") {
      return next;
    }

    if (raw.settings && typeof raw.settings === "object") {
      if (typeof raw.settings.apiBaseUrl === "string") {
        next.settings.apiBaseUrl = raw.settings.apiBaseUrl;
      }

      if (typeof raw.settings.playerName === "string") {
        next.settings.playerName = raw.settings.playerName;
      }
    }

    if (raw.ui && typeof raw.ui === "object") {
      if (typeof raw.ui.collapsed === "boolean") {
        next.ui.collapsed = raw.ui.collapsed;
      }

      if (typeof raw.ui.notice === "string") {
        next.ui.notice = raw.ui.notice;
      }

      if (typeof raw.ui.error === "string") {
        next.ui.error = raw.ui.error;
      }
    }

    if (raw.solo && typeof raw.solo === "object") {
      next.solo.difficulty = sanitizeDifficulty(raw.solo.difficulty);
      next.solo.challenge = raw.solo.challenge ?? null;
      next.solo.phase = typeof raw.solo.phase === "string" ? raw.solo.phase : "idle";
      next.solo.startedAt = Number(raw.solo.startedAt) || null;
      next.solo.finishedAt = Number(raw.solo.finishedAt) || null;
      next.solo.lastTitle = typeof raw.solo.lastTitle === "string" ? raw.solo.lastTitle : "";
      next.solo.path = Array.isArray(raw.solo.path) ? raw.solo.path.slice(0, 1200) : [];
    }

    if (raw.versus && typeof raw.versus === "object") {
      next.versus.difficulty = sanitizeDifficulty(raw.versus.difficulty);
      next.versus.active = Boolean(raw.versus.active);
      next.versus.roomId = typeof raw.versus.roomId === "string" ? raw.versus.roomId : "";
      next.versus.playerId = typeof raw.versus.playerId === "string" ? raw.versus.playerId : "";
      next.versus.room = raw.versus.room ?? null;
      next.versus.joinRoomId = typeof raw.versus.joinRoomId === "string" ? raw.versus.joinRoomId : "";
      next.versus.localPath = Array.isArray(raw.versus.localPath) ? raw.versus.localPath.slice(0, 1200) : [];
      next.versus.localLastTitle = typeof raw.versus.localLastTitle === "string" ? raw.versus.localLastTitle : "";
      next.versus.localFinishedAt = Number(raw.versus.localFinishedAt) || null;
      next.versus.round = Number(raw.versus.round) || 0;
      next.versus.autoJumpedRound = Number(raw.versus.autoJumpedRound) || 0;
    }

    return next;
  }

  function loadState() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        resolve(result?.[STORAGE_KEY] ?? null);
      });
    });
  }

  function persistState() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: state }, resolve);
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatMs(ms) {
    const total = Math.max(0, Math.floor(ms));
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const centiseconds = Math.floor((total % 1000) / 10);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
  }

  function currentSoloElapsedMs() {
    if (!state.solo.startedAt) {
      return 0;
    }

    const endAt = state.solo.finishedAt || nowMs();
    return Math.max(0, endAt - state.solo.startedAt);
  }

  function myVersusElapsedMs() {
    const room = state.versus.room;

    if (!room || !room.startAt || !state.versus.playerId) {
      return 0;
    }

    const board = Array.isArray(room.leaderboard)
      ? room.leaderboard.find((item) => item.id === state.versus.playerId)
      : null;

    if (board && typeof board.elapsedMs === "number") {
      return board.elapsedMs;
    }

    if (board && typeof board.finishedAt === "number") {
      return Math.max(0, board.finishedAt - room.startAt);
    }

    if (typeof state.versus.localFinishedAt === "number") {
      return Math.max(0, state.versus.localFinishedAt - room.startAt);
    }

    if (nowMs() < room.startAt) {
      return 0;
    }

    return Math.max(0, nowMs() - room.startAt);
  }

  function formatRoomStatus(status) {
    if (status === "waiting") {
      return "待機中";
    }

    if (status === "running") {
      return "進行中";
    }

    if (status === "finished") {
      return "終了";
    }

    return "-";
  }

  function joinedPathText(path) {
    if (!Array.isArray(path) || path.length === 0) {
      return "-";
    }

    const clipped = path.slice(-28);
    return clipped.join(" -> ");
  }

  function resetVersusTracking(room) {
    state.versus.localPath = [];
    state.versus.localLastTitle = "";
    state.versus.localFinishedAt = null;
    state.versus.autoJumpedRound = 0;
    state.versus.round = Number(room?.round) || 0;
  }

  function maybeResetVersusRound(room) {
    const nextRound = Number(room?.round) || 0;

    if (!nextRound) {
      return false;
    }

    if (state.versus.round !== nextRound) {
      resetVersusTracking(room);
      return true;
    }

    return false;
  }

  function maybeAutoJumpToStart(room, currentTitle) {
    if (!room || !room.challenge || !room.startAt || room.status !== "running") {
      return false;
    }

    if (nowMs() < room.startAt) {
      return false;
    }

    if (state.versus.autoJumpedRound === room.round) {
      return false;
    }

    state.versus.autoJumpedRound = room.round;

    if (currentTitle === room.challenge.startTitle) {
      return false;
    }

    window.location.href = articleUrl(room.challenge.startTitle);
    return true;
  }

  function trackVersusLocalProgress(currentTitle) {
    if (!state.versus.active || !currentTitle) {
      return false;
    }

    let changed = false;

    const room = state.versus.room;
    const raceActive = Boolean(
      room
      && room.status === "running"
      && room.startAt
      && nowMs() >= room.startAt
      && room.challenge
    );

    if (!raceActive) {
      return changed;
    }

    if (state.versus.localPath.length === 0) {
      const refTitle = currentReferrerTitle();
      state.versus.localPath = refTitle && refTitle !== currentTitle ? [refTitle, currentTitle] : [currentTitle];
      state.versus.localLastTitle = currentTitle;
      changed = true;
    }

    if (state.versus.localLastTitle !== currentTitle) {
      state.versus.localLastTitle = currentTitle;

      if (state.versus.localPath[state.versus.localPath.length - 1] !== currentTitle) {
        state.versus.localPath.push(currentTitle);
      }

      changed = true;
    }

    if (room?.challenge?.goalTitle && currentTitle === room.challenge.goalTitle && !state.versus.localFinishedAt) {
      state.versus.localFinishedAt = nowMs();
      changed = true;
    }

    return changed;
  }

  async function syncVersusMovesFromLocalPath(roomId, room) {
    const roomMe = room?.me ?? getMyPlayerFromRoom(room);

    if (!roomMe || roomMe.finishedAt || !roomMe.currentTitle) {
      return { room, changed: false };
    }

    const serverCurrent = roomMe.currentTitle;
    let changed = false;

    if (Array.isArray(roomMe.path) && roomMe.path.length > 0 && state.versus.localPath.length < roomMe.path.length) {
      state.versus.localPath = roomMe.path.slice(-1200);
      state.versus.localLastTitle = state.versus.localPath[state.versus.localPath.length - 1] || serverCurrent;
      changed = true;
    }

    if (state.versus.localPath.length === 0) {
      state.versus.localPath = [serverCurrent];
      state.versus.localLastTitle = serverCurrent;
      changed = true;
    }

    let serverIndex = state.versus.localPath.lastIndexOf(serverCurrent);

    if (serverIndex < 0) {
      state.versus.localPath = [serverCurrent, ...state.versus.localPath.slice(-30)];
      state.versus.localLastTitle = state.versus.localPath[state.versus.localPath.length - 1] || serverCurrent;
      changed = true;
      serverIndex = 0;
    }

    const pendingTitles = state.versus.localPath.slice(serverIndex + 1);
    let nextRoom = room;

    for (const nextTitle of pendingTitles) {
      try {
        const moveResult = await apiFetch(`/api/room/${roomId}/move`, {
          method: "POST",
          body: {
            playerId: state.versus.playerId,
            toTitle: nextTitle,
          },
        });

        nextRoom = moveResult.room;
        changed = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (!message.includes("INVALID_MOVE")) {
          throw error;
        }

        const invalidIndex = state.versus.localPath.indexOf(nextTitle, serverIndex + 1);

        if (invalidIndex >= 0) {
          state.versus.localPath.splice(invalidIndex, 1);
          state.versus.localLastTitle = state.versus.localPath[state.versus.localPath.length - 1] || serverCurrent;
          changed = true;
        }

        if (
          nextRoom
          && nextRoom.startAt
          && nowMs() >= nextRoom.startAt
          && nextRoom.challenge?.goalTitle
          && nextTitle === nextRoom.challenge.goalTitle
          && !state.versus.localFinishedAt
        ) {
          state.versus.localFinishedAt = nowMs();
          setNotice("ゴール到達をローカルで記録 (同期待ち)");
          changed = true;
        }

        continue;
      }
    }

    return { room: nextRoom, changed };
  }

  function statusTextForSolo() {
    if (!state.solo.challenge) {
      return "チャレンジ未生成";
    }

    if (state.solo.phase === "awaiting_start") {
      return "スタート記事に移動すると開始";
    }

    if (state.solo.phase === "running") {
      return "プレイ中";
    }

    if (state.solo.phase === "finished") {
      return "ゴール到達";
    }

    return "準備完了";
  }

  function clearSoloState() {
    state.solo.challenge = null;
    state.solo.phase = "idle";
    state.solo.startedAt = null;
    state.solo.finishedAt = null;
    state.solo.lastTitle = "";
    state.solo.path = [];
  }

  function clearVersusState() {
    state.versus.active = false;
    state.versus.roomId = "";
    state.versus.playerId = "";
    state.versus.room = null;
    state.versus.localPath = [];
    state.versus.localLastTitle = "";
    state.versus.localFinishedAt = null;
    state.versus.round = 0;
    state.versus.autoJumpedRound = 0;
  }

  function setNotice(message) {
    state.ui.notice = message;
    state.ui.error = "";
  }

  function setError(message) {
    state.ui.error = message;
  }

  async function apiFetch(path, options = {}) {
    const payload = {
      type: "wiki-race-api",
      baseUrl: state.settings.apiBaseUrl || DEFAULT_API_BASE,
      path,
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body,
    };

    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(payload, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(result);
      });
    });

    if (!response || !response.ok) {
      const message = response && typeof response.error === "string"
        ? response.error
        : `API request failed for ${path}`;
      throw new Error(message);
    }

    return response.data;
  }

  function advanceSoloWithCurrentTitle(currentTitle) {
    if (!state.solo.challenge || !currentTitle) {
      return false;
    }

    let changed = false;

    if (state.solo.phase === "awaiting_start" && currentTitle === state.solo.challenge.startTitle) {
      state.solo.phase = "running";
      state.solo.startedAt = nowMs();
      state.solo.finishedAt = null;
      state.solo.lastTitle = currentTitle;
      state.solo.path = [currentTitle];
      setNotice("ソロ開始");
      changed = true;
    }

    if (state.solo.phase === "running") {
      if (!state.solo.lastTitle) {
        state.solo.lastTitle = currentTitle;

        if (state.solo.path.length === 0) {
          state.solo.path = [currentTitle];
        }

        changed = true;
      } else if (state.solo.lastTitle !== currentTitle) {
        state.solo.lastTitle = currentTitle;
        state.solo.path.push(currentTitle);
        changed = true;
      }

      if (currentTitle === state.solo.challenge.goalTitle && !state.solo.finishedAt) {
        state.solo.phase = "finished";
        state.solo.finishedAt = nowMs();
        setNotice("ソロでゴール到達");
        changed = true;
      }
    }

    return changed;
  }

  async function refreshVersusRoom({ applyMove = false, currentTitle = "" } = {}) {
    if (!state.versus.active || !state.versus.roomId || !state.versus.playerId) {
      return false;
    }

    if (refreshInFlight) {
      return false;
    }

    refreshInFlight = true;

    try {
      const roomId = encodeURIComponent(state.versus.roomId);
      const playerId = encodeURIComponent(state.versus.playerId);
      const previousSignature = roomSignature(state.versus.room);
      let room = await apiFetch(`/api/room/${roomId}?playerId=${playerId}`);
      let changed = maybeResetVersusRound(room);

      if (applyMove && currentTitle && room && room.status === "running" && room.startAt && nowMs() >= room.startAt) {
        const syncResult = await syncVersusMovesFromLocalPath(roomId, room);
        room = syncResult.room;
        changed = syncResult.changed || changed;
      }

      state.versus.room = room;
      const nextSignature = roomSignature(room);

      if (previousSignature !== nextSignature) {
        changed = true;
      }

      const myBoard = room && Array.isArray(room.leaderboard)
        ? room.leaderboard.find((item) => item.id === state.versus.playerId)
        : null;

      if (
        myBoard
        && (typeof myBoard.elapsedMs === "number" || typeof myBoard.finishedAt === "number")
        && state.versus.localFinishedAt
      ) {
        state.versus.localFinishedAt = null;
        changed = true;
      }

      if (maybeAutoJumpToStart(room, currentTitle)) {
        changed = true;
      }

      return changed;
    } finally {
      refreshInFlight = false;
    }
  }

  async function handlePageVisit() {
    const currentTitle = currentTitleFromLocation();
    let changed = false;

    if (advanceSoloWithCurrentTitle(currentTitle)) {
      changed = true;
    }

    if (trackVersusLocalProgress(currentTitle)) {
      changed = true;
    }

    if (state.versus.active) {
      try {
        const roomChanged = await refreshVersusRoom({
          applyMove: true,
          currentTitle,
        });

        changed = roomChanged || changed;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setError(message);
        changed = true;
      }
    }

    if (changed) {
      await persistState();
    }
  }

  function mount() {
    let host = document.getElementById(HOST_ID);

    if (host) {
      host.remove();
    }

    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.position = "fixed";
    host.style.top = "12px";
    host.style.right = "12px";
    host.style.zIndex = "2147483647";
    document.documentElement.append(host);

    shadowRoot = host.attachShadow({ mode: "open" });
  }

  async function runAction(actionName, action) {
    if (!state || state.ui.busy) {
      return;
    }

    state.ui.busy = actionName;
    state.ui.error = "";
    await persistState();
    render();

    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(message);
    } finally {
      state.ui.busy = "";
      await persistState();
      render();
    }
  }

  async function startSoloAction() {
    await runAction("solo", async () => {
      const challenge = await apiFetch("/api/challenge", {
        method: "POST",
        body: { difficulty: state.solo.difficulty },
      });

      clearSoloState();
      state.solo.challenge = challenge;
      state.solo.phase = "awaiting_start";
      setNotice(`ソロ問題生成: ${challenge.startTitle} -> ${challenge.goalTitle}`);

      advanceSoloWithCurrentTitle(currentTitleFromLocation());
    });
  }

  async function resetSoloAction() {
    await runAction("solo-reset", async () => {
      clearSoloState();
      setNotice("ソロ状態をリセット");
    });
  }

  async function createRoomAction() {
    await runAction("create-room", async () => {
      const response = await apiFetch("/api/room", {
        method: "POST",
        body: {
          difficulty: state.versus.difficulty,
          name: state.settings.playerName || "プレイヤー",
        },
      });

      state.versus.active = true;
      state.versus.roomId = response.roomId;
      state.versus.playerId = response.playerId;
      state.versus.room = response.room;
      state.versus.joinRoomId = response.roomId;
      state.versus.localPath = [];
      state.versus.localLastTitle = "";
      state.versus.localFinishedAt = null;
      state.versus.round = Number(response?.room?.round) || 0;
      state.versus.autoJumpedRound = 0;
      setNotice(`ルーム作成: ${response.roomId}`);
    });
  }

  async function joinRoomAction(roomIdInput) {
    const roomId = roomIdInput.trim();

    if (!roomId) {
      setError("ルームIDを入力してください");
      await persistState();
      render();
      return;
    }

    await runAction("join-room", async () => {
      const joinResponse = await apiFetch(`/api/room/${encodeURIComponent(roomId)}/join`, {
        method: "POST",
        body: {
          name: state.settings.playerName || "プレイヤー",
        },
      });

      state.versus.active = true;
      state.versus.roomId = roomId;
      state.versus.playerId = joinResponse.playerId;
      state.versus.room = joinResponse.room;
      state.versus.joinRoomId = roomId;
      state.versus.localPath = [];
      state.versus.localLastTitle = "";
      state.versus.localFinishedAt = null;
      state.versus.round = Number(joinResponse?.room?.round) || 0;
      state.versus.autoJumpedRound = 0;
      setNotice(`ルーム参加: ${roomId}`);
    });
  }

  async function toggleReadyAction() {
    if (!state.versus.active || !state.versus.roomId || !state.versus.playerId || !state.versus.room) {
      setError("先にルームへ参加してください");
      await persistState();
      render();
      return;
    }

    await runAction("ready", async () => {
      const me = state.versus.room.players.find((player) => player.id === state.versus.playerId);

      if (!me) {
        throw new Error("ルーム内にプレイヤーが見つかりません");
      }

      const response = await apiFetch(`/api/room/${encodeURIComponent(state.versus.roomId)}/ready`, {
        method: "POST",
        body: {
          playerId: state.versus.playerId,
          ready: !me.ready,
        },
      });

      state.versus.room = response.room;
      setNotice(!me.ready ? "Readyにしました" : "Readyを解除しました");
    });
  }

  async function refreshRoomAction() {
    await runAction("refresh-room", async () => {
      if (!state.versus.active) {
        return;
      }

      await refreshVersusRoom({
        applyMove: true,
        currentTitle: currentTitleFromLocation(),
      });

      setNotice("ルーム情報を更新");
    });
  }

  async function nextRoundAction() {
    if (!state.versus.active || !state.versus.roomId || !state.versus.playerId) {
      setError("先にルームへ参加してください");
      await persistState();
      render();
      return;
    }

    await runAction("next-round", async () => {
      const response = await apiFetch(`/api/room/${encodeURIComponent(state.versus.roomId)}/next`, {
        method: "POST",
        body: {
          playerId: state.versus.playerId,
          difficulty: state.versus.difficulty,
        },
      });

      state.versus.room = response.room;
      resetVersusTracking(response.room);
      setNotice("次ラウンドのお題を生成");
    });
  }

  async function leaveRoomAction() {
    await runAction("leave-room", async () => {
      clearVersusState();
      setNotice("このブラウザのルーム状態をクリア");
    });
  }

  async function saveSettingsAction(apiBaseUrl, playerName) {
    await runAction("save-settings", async () => {
      state.settings.apiBaseUrl = String(apiBaseUrl || DEFAULT_API_BASE).trim() || DEFAULT_API_BASE;
      state.settings.playerName = String(playerName || "プレイヤー").trim().slice(0, 20) || "プレイヤー";
      setNotice("設定を保存しました");
    });
  }

  async function copyRoomIdAction() {
    if (!state.versus.roomId) {
      setError("コピーするルームIDがありません");
      await persistState();
      render();
      return;
    }

    try {
      await navigator.clipboard.writeText(state.versus.roomId);
      setNotice("ルームIDをコピーしました");
      await persistState();
      render();
    } catch {
      setError("ルームIDのコピーに失敗しました");
      await persistState();
      render();
    }
  }

  function startTimers() {
    if (liveTimer) {
      window.clearInterval(liveTimer);
    }

    liveTimer = window.setInterval(updateLiveValues, 180);

    if (roomPollTimer) {
      window.clearInterval(roomPollTimer);
    }

    roomPollTimer = window.setInterval(async () => {
      if (!state || !state.versus.active || state.ui.busy || refreshInFlight) {
        return;
      }

      try {
        const changed = await refreshVersusRoom({
          applyMove: true,
          currentTitle: currentTitleFromLocation(),
        });

        if (changed) {
          await persistState();
          render();
        } else {
          updateLiveValues();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setError(message);
        await persistState();
        render();
      }
    }, 700);
  }

  function updateLiveValues() {
    if (!shadowRoot) {
      return;
    }

    const soloTimer = shadowRoot.getElementById("solo-live-timer");

    if (soloTimer) {
      soloTimer.textContent = formatMs(currentSoloElapsedMs());
    }

    const versusTimer = shadowRoot.getElementById("versus-live-timer");

    if (versusTimer) {
      versusTimer.textContent = formatMs(myVersusElapsedMs());
    }

    const countdown = shadowRoot.getElementById("versus-countdown");
    const room = state.versus.room;

    if (countdown && room && room.status === "running" && room.startAt && nowMs() < room.startAt) {
      countdown.textContent = `${((room.startAt - nowMs()) / 1000).toFixed(1)}s`;
    } else if (countdown) {
      countdown.textContent = "-";
    }
  }

  function render() {
    if (!shadowRoot || !state) {
      return;
    }

    const previousOverlay = shadowRoot.querySelector(".overlay");
    const previousScrollTop = previousOverlay ? previousOverlay.scrollTop : 0;

    const currentTitle = currentTitleFromLocation();
    const isBusy = Boolean(state.ui.busy);
    const busyAttr = isBusy ? "disabled" : "";
    const soloChallenge = state.solo.challenge;
    const soloClicks = Math.max(0, state.solo.path.length - 1);
    const room = state.versus.room;
    const me = getMyPlayerFromRoom(room);
    const challengeVisible = Boolean(room?.challenge);
    const canPrepareNextRound = Boolean(state.versus.active && room && room.status !== "running");
    const myRoomStatusLabel = formatRoomStatus(room?.status);
    const soloPathText = joinedPathText(state.solo.path);
    const versusPathText = joinedPathText(state.versus.localPath);
    const syncedPathText = joinedPathText(me?.path);

    const playersHtml = room && Array.isArray(room.players)
      ? room.players
          .map((player) => {
            const board = Array.isArray(room.leaderboard)
              ? room.leaderboard.find((item) => item.id === player.id)
              : null;
            const role = player.id === state.versus.playerId ? "あなた" : "相手";
            const resultMs = board && typeof board.elapsedMs === "number"
              ? board.elapsedMs
              : board && typeof board.finishedAt === "number" && room.startAt
                ? Math.max(0, board.finishedAt - room.startAt)
                : null;
            const resultText = resultMs !== null ? formatMs(resultMs) : "進行中";

            return `
              <div class="player-card">
                <div class="row">
                  <strong>${escapeHtml(player.name)}</strong>
                  <span class="muted">${role}</span>
                </div>
                <div class="muted small">Ready: ${player.ready ? "はい" : "いいえ"} | クリック: ${player.clicks}</div>
                <div class="muted small">結果: ${escapeHtml(resultText)}</div>
                <div class="muted small">ルート: ${escapeHtml(joinedPathText(player.path))}</div>
              </div>
            `;
          })
          .join("")
      : `<div class="muted">ルーム情報なし</div>`;

    const winnerHtml = room && room.winnerId && Array.isArray(room.leaderboard) && room.leaderboard[0]
      ? `<div class="success">勝者: ${escapeHtml(room.leaderboard[0].name)} (${formatMs(room.leaderboard[0].elapsedMs || 0)})</div>`
      : "";
    const currentLeaderHtml = room && Array.isArray(room.leaderboard) && room.leaderboard[0]
      ? `<div class="small muted">現在トップ: ${escapeHtml(room.leaderboard[0].name)}</div>`
      : "";

    shadowRoot.innerHTML = `
      <style>
        :host { all: initial; }
        .overlay {
          width: 340px;
          max-height: calc(100vh - 24px);
          overflow: auto;
          background: #0f1f2d;
          color: #e7f3ff;
          border: 1px solid #355b7d;
          border-radius: 12px;
          box-shadow: 0 12px 38px rgba(0, 0, 0, 0.38);
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
          font-size: 13px;
          line-height: 1.4;
        }
        .overlay.collapsed .body { display: none; }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 10px;
          position: sticky;
          top: 0;
          background: #122738;
          border-bottom: 1px solid #355b7d;
          z-index: 1;
        }
        .title {
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        button, select, input {
          font: inherit;
        }
        button {
          border: 1px solid #517ba0;
          background: #163a57;
          color: #e7f3ff;
          border-radius: 8px;
          padding: 5px 8px;
          cursor: pointer;
        }
        button:hover:enabled {
          background: #1d486c;
        }
        button:disabled {
          opacity: 0.58;
          cursor: default;
        }
        .body {
          padding: 10px;
          display: grid;
          gap: 10px;
        }
        .section {
          border: 1px solid #345570;
          border-radius: 10px;
          padding: 8px;
          display: grid;
          gap: 7px;
          background: rgba(10, 30, 45, 0.6);
        }
        .section > .section-title {
          font-weight: 700;
          color: #9ecfff;
        }
        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 7px;
          flex-wrap: wrap;
        }
        .muted {
          color: #b5cde2;
        }
        .small {
          font-size: 12px;
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }
        .timer {
          font-size: 18px;
          font-weight: 700;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }
        .status {
          padding: 6px 8px;
          border-radius: 8px;
          background: #173a56;
          border: 1px solid #355b7d;
        }
        .error {
          color: #ffd1d1;
          background: #4f2424;
          border: 1px solid #8c3c3c;
        }
        .success {
          color: #d2ffe8;
          background: #1a4a39;
          border: 1px solid #2f6d56;
          border-radius: 8px;
          padding: 6px 8px;
        }
        input, select {
          width: 100%;
          border: 1px solid #517ba0;
          border-radius: 8px;
          padding: 5px 7px;
          color: #e7f3ff;
          background: #0e2f48;
        }
        .split {
          display: grid;
          grid-template-columns: 1fr 110px;
          gap: 6px;
          align-items: center;
        }
        .buttons {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .player-card {
          border: 1px solid #3c5f7a;
          border-radius: 8px;
          padding: 6px;
          background: #102c42;
          display: grid;
          gap: 4px;
        }
      </style>
      <div class="overlay ${state.ui.collapsed ? "collapsed" : ""}">
        <div class="header">
          <div class="title">Wiki Link Race</div>
          <button id="toggle-collapse" type="button">${state.ui.collapsed ? "開く" : "閉じる"}</button>
        </div>
        <div class="body">
          <div class="section">
            <div class="section-title">設定</div>
            <div class="small muted">現在ページ: ${escapeHtml(currentTitle || "-")}</div>
            <div>
              <label class="small muted" for="api-base-url">APIベースURL</label>
              <input id="api-base-url" type="text" value="${escapeHtml(state.settings.apiBaseUrl)}" ${busyAttr} />
            </div>
            <div>
              <label class="small muted" for="player-name">プレイヤー名</label>
              <input id="player-name" type="text" maxlength="20" value="${escapeHtml(state.settings.playerName)}" ${busyAttr} />
            </div>
            <div class="buttons">
              <button id="save-settings" type="button" ${busyAttr}>保存</button>
            </div>
          </div>

          <div class="section">
            <div class="section-title">対戦</div>
            <div class="split">
              <select id="versus-difficulty" ${busyAttr}>
                ${DIFFICULTIES.map((value) => `<option value="${value}" ${state.versus.difficulty === value ? "selected" : ""}>${value}</option>`).join("")}
              </select>
              <button id="create-room" type="button" ${busyAttr}>ルーム作成</button>
            </div>
            <div class="split">
              <input id="join-room-id" type="text" placeholder="ルームID" value="${escapeHtml(state.versus.joinRoomId)}" ${busyAttr} />
              <button id="join-room" type="button" ${busyAttr}>参加</button>
            </div>
            <div class="small muted">ルーム: <span class="mono">${escapeHtml(state.versus.roomId || "-")}</span></div>
            <div class="small muted">ラウンド: ${room?.round ?? "-"}</div>
            <div class="small muted">スタート: ${escapeHtml(challengeVisible ? room?.challenge?.startTitle : "Ready後に公開")}</div>
            <div class="small muted">ゴール: ${escapeHtml(challengeVisible ? room?.challenge?.goalTitle : "Ready後に公開")}</div>
            <div class="small muted">状態: ${escapeHtml(myRoomStatusLabel)} | 開始まで: <span id="versus-countdown">-</span></div>
            <div class="small muted">あなたのタイム: <span class="timer" id="versus-live-timer">${formatMs(myVersusElapsedMs())}</span></div>
            <div class="buttons">
              <button id="toggle-ready" type="button" ${busyAttr} ${state.versus.active ? "" : "disabled"}>
                ${me?.ready ? "Ready解除" : "Ready"}
              </button>
              <button id="versus-open-start" type="button" ${busyAttr} ${challengeVisible ? "" : "disabled"}>開始ページへ</button>
              <button id="next-round" type="button" ${busyAttr} ${canPrepareNextRound ? "" : "disabled"}>次ラウンド</button>
              <button id="copy-room-id" type="button" ${busyAttr} ${state.versus.roomId ? "" : "disabled"}>ルームIDコピー</button>
              <button id="refresh-room" type="button" ${busyAttr}>更新</button>
              <button id="leave-room" type="button" ${busyAttr}>退出</button>
            </div>
            <div class="small muted">あなたの遷移(ローカル): ${escapeHtml(versusPathText)}</div>
            <div class="small muted">あなたの遷移(同期): ${escapeHtml(syncedPathText)}</div>
            ${currentLeaderHtml}
            ${winnerHtml}
            ${playersHtml}
          </div>

          <div class="section">
            <div class="section-title">ソロ</div>
            <div class="split">
              <select id="solo-difficulty" ${busyAttr}>
                ${DIFFICULTIES.map((value) => `<option value="${value}" ${state.solo.difficulty === value ? "selected" : ""}>${value}</option>`).join("")}
              </select>
              <button id="solo-generate" type="button" ${busyAttr}>問題生成</button>
            </div>
            <div class="status">${escapeHtml(statusTextForSolo())}</div>
            <div class="row">
              <div class="timer" id="solo-live-timer">${formatMs(currentSoloElapsedMs())}</div>
              <div class="small muted">クリック: ${soloClicks}</div>
            </div>
            <div class="small muted">スタート: ${escapeHtml(soloChallenge?.startTitle || "-")}</div>
            <div class="small muted">ゴール: ${escapeHtml(soloChallenge?.goalTitle || "-")}</div>
            <div class="small muted">遷移ルート: ${escapeHtml(soloPathText)}</div>
            <div class="buttons">
              <button id="solo-open-start" type="button" ${busyAttr} ${soloChallenge ? "" : "disabled"}>開始ページへ</button>
              <button id="solo-reset" type="button" ${busyAttr}>リセット</button>
            </div>
          </div>

          ${state.ui.notice ? `<div class="status">${escapeHtml(state.ui.notice)}</div>` : ""}
          ${state.ui.error ? `<div class="status error">${escapeHtml(state.ui.error)}</div>` : ""}
        </div>
      </div>
    `;

    const nextOverlay = shadowRoot.querySelector(".overlay");

    if (nextOverlay) {
      nextOverlay.scrollTop = previousScrollTop;
    }

    bindEvents();
    updateLiveValues();
  }

  function bindEvents() {
    if (!shadowRoot) {
      return;
    }

    const collapseButton = shadowRoot.getElementById("toggle-collapse");
    const saveSettingsButton = shadowRoot.getElementById("save-settings");
    const soloDifficultySelect = shadowRoot.getElementById("solo-difficulty");
    const soloGenerateButton = shadowRoot.getElementById("solo-generate");
    const soloOpenStartButton = shadowRoot.getElementById("solo-open-start");
    const soloResetButton = shadowRoot.getElementById("solo-reset");
    const versusDifficultySelect = shadowRoot.getElementById("versus-difficulty");
    const createRoomButton = shadowRoot.getElementById("create-room");
    const joinRoomButton = shadowRoot.getElementById("join-room");
    const readyButton = shadowRoot.getElementById("toggle-ready");
    const versusOpenStartButton = shadowRoot.getElementById("versus-open-start");
    const nextRoundButton = shadowRoot.getElementById("next-round");
    const copyRoomIdButton = shadowRoot.getElementById("copy-room-id");
    const refreshRoomButton = shadowRoot.getElementById("refresh-room");
    const leaveRoomButton = shadowRoot.getElementById("leave-room");

    if (collapseButton) {
      collapseButton.addEventListener("click", async () => {
        state.ui.collapsed = !state.ui.collapsed;
        await persistState();
        render();
      });
    }

    if (saveSettingsButton) {
      saveSettingsButton.addEventListener("click", async () => {
        const apiBaseInput = shadowRoot.getElementById("api-base-url");
        const playerNameInput = shadowRoot.getElementById("player-name");
        const apiBaseUrl = apiBaseInput ? apiBaseInput.value : DEFAULT_API_BASE;
        const playerName = playerNameInput ? playerNameInput.value : "Player";
        await saveSettingsAction(apiBaseUrl, playerName);
      });
    }

    if (soloDifficultySelect) {
      soloDifficultySelect.addEventListener("change", async () => {
        state.solo.difficulty = sanitizeDifficulty(soloDifficultySelect.value);
        await persistState();
      });
    }

    if (soloGenerateButton) {
      soloGenerateButton.addEventListener("click", async () => {
        await startSoloAction();
      });
    }

    if (soloOpenStartButton) {
      soloOpenStartButton.addEventListener("click", () => {
        if (state.solo.challenge?.startTitle) {
          window.location.href = articleUrl(state.solo.challenge.startTitle);
        }
      });
    }

    if (soloResetButton) {
      soloResetButton.addEventListener("click", async () => {
        await resetSoloAction();
      });
    }

    if (versusDifficultySelect) {
      versusDifficultySelect.addEventListener("change", async () => {
        state.versus.difficulty = sanitizeDifficulty(versusDifficultySelect.value);
        await persistState();
      });
    }

    if (createRoomButton) {
      createRoomButton.addEventListener("click", async () => {
        await createRoomAction();
      });
    }

    if (joinRoomButton) {
      joinRoomButton.addEventListener("click", async () => {
        const roomIdInput = shadowRoot.getElementById("join-room-id");
        const roomId = roomIdInput ? roomIdInput.value : "";
        state.versus.joinRoomId = roomId;
        await joinRoomAction(roomId);
      });
    }

    if (readyButton) {
      readyButton.addEventListener("click", async () => {
        await toggleReadyAction();
      });
    }

    if (versusOpenStartButton) {
      versusOpenStartButton.addEventListener("click", () => {
        const startTitle = state.versus.room?.challenge?.startTitle;

        if (startTitle) {
          window.location.href = articleUrl(startTitle);
        }
      });
    }

    if (nextRoundButton) {
      nextRoundButton.addEventListener("click", async () => {
        await nextRoundAction();
      });
    }

    if (copyRoomIdButton) {
      copyRoomIdButton.addEventListener("click", async () => {
        await copyRoomIdAction();
      });
    }

    if (refreshRoomButton) {
      refreshRoomButton.addEventListener("click", async () => {
        await refreshRoomAction();
      });
    }

    if (leaveRoomButton) {
      leaveRoomButton.addEventListener("click", async () => {
        await leaveRoomAction();
      });
    }
  }
})();
