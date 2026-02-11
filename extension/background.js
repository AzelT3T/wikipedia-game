/* global chrome */

function normalizeBaseUrl(baseUrl) {
  const fallback = "http://localhost:3000";

  if (typeof baseUrl !== "string" || baseUrl.trim() === "") {
    return fallback;
  }

  return baseUrl.trim().replace(/\/$/, "");
}

async function requestApi(message) {
  const baseUrl = normalizeBaseUrl(message.baseUrl);
  const path = typeof message.path === "string" ? message.path : "/";
  const method = typeof message.method === "string" ? message.method : "GET";
  const headers = {
    "Content-Type": "application/json",
    ...(message.headers && typeof message.headers === "object" ? message.headers : {}),
  };

  const url = new URL(path, `${baseUrl}/`);
  const options = {
    method,
    headers,
    cache: "no-store",
  };

  if (message.body !== undefined && message.body !== null) {
    options.body = JSON.stringify(message.body);
  }

  const response = await fetch(url.toString(), options);
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const error = data && typeof data === "object" && typeof data.error === "string"
      ? data.error
      : `Request failed with status ${response.status}`;

    return {
      ok: false,
      status: response.status,
      error,
      data,
    };
  }

  return {
    ok: true,
    status: response.status,
    data,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "wiki-race-api") {
    return false;
  }

  requestApi(message)
    .then((result) => sendResponse(result))
    .catch((error) => {
      const messageText = error instanceof Error ? error.message : String(error);
      sendResponse({
        ok: false,
        status: 500,
        error: messageText,
      });
    });

  return true;
});
