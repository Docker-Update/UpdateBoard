import path from "node:path";
import { createServer } from "node:http";
import express from "express";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";
import { DEFAULT_SETTINGS } from "./defaults.js";
import {
  authenticateLogin,
  createSession,
  destroySessionFromRequest,
  getSessionCookieName,
  getUsernameFromRequest,
  requireAuth
} from "./utils/auth.js";
import { getContainerDetails, listRunningContainers, pingDocker, watchDockerContainerEvents } from "./services/dockerService.js";
import { notifyIfNeeded, sendTestNotifications } from "./services/notifierService.js";
import { runScan } from "./services/scanService.js";
import { computeNextRunAt, startOrReplaceSchedule } from "./services/schedulerService.js";
import { getSettings, getState, saveSettings, saveState } from "./utils/store.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8080);
const server = createServer(app);
const websocketClients = new Set();
const websocketDetailSubscriptions = new Map();
const websocketServer = new WebSocketServer({ server, path: "/ws" });

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.resolve(process.cwd(), "src/public")));

let settings = getSettings();
let state = getState();
let scanLock = false;
let broadcastContainersTimer = null;
let websocketHeartbeatTimer = null;
let websocketDetailBroadcastTimer = null;

const sessionCookieName = getSessionCookieName();

function sanitizeSettings(input) {
  const hourRaw = Number(input?.schedule?.hour);
  const minuteRaw = Number(input?.schedule?.minute);
  const smtpPortRaw = Number(input?.notifications?.email?.smtp?.port);

  const hour = Number.isInteger(hourRaw) ? Math.max(0, Math.min(23, hourRaw)) : DEFAULT_SETTINGS.schedule.hour;
  const minute = Number.isInteger(minuteRaw)
    ? Math.max(0, Math.min(59, minuteRaw))
    : DEFAULT_SETTINGS.schedule.minute;
  const smtpPort = Number.isInteger(smtpPortRaw) ? Math.max(1, Math.min(65535, smtpPortRaw)) : 587;

  return {
    schedule: {
      hour,
      minute
    },
    ui: {
      theme: ["auto", "light", "dark"].includes(input?.ui?.theme) ? input.ui.theme : "auto"
    },
    notifications: {
      discord: {
        enabled: Boolean(input?.notifications?.discord?.enabled),
        webhookUrl: String(input?.notifications?.discord?.webhookUrl || "").trim()
      },
      telegram: {
        enabled: Boolean(input?.notifications?.telegram?.enabled),
        botToken: String(input?.notifications?.telegram?.botToken || "").trim(),
        chatId: String(input?.notifications?.telegram?.chatId || "").trim()
      },
      email: {
        enabled: Boolean(input?.notifications?.email?.enabled),
        recipients: String(input?.notifications?.email?.recipients || "").trim(),
        smtp: {
          host: String(input?.notifications?.email?.smtp?.host || "").trim(),
          port: smtpPort,
          user: String(input?.notifications?.email?.smtp?.user || "").trim(),
          pass: String(input?.notifications?.email?.smtp?.pass || "").trim(),
          secure: Boolean(input?.notifications?.email?.smtp?.secure),
          from: String(input?.notifications?.email?.smtp?.from || "").trim()
        }
      },
      webhook: {
        enabled: Boolean(input?.notifications?.webhook?.enabled),
        url: String(input?.notifications?.webhook?.url || "").trim(),
        method: "POST"
      }
    }
  };
}

function refreshSchedule() {
  const scheduled = startOrReplaceSchedule({
    hour: settings.schedule.hour,
    minute: settings.schedule.minute,
    onTick: () => {
      void executeScan("scheduled");
    }
  });

  state.nextRunAt = scheduled.nextRunAt;
  saveState(state);
  broadcastDashboardUpdate("schedule-updated", {
    nextRunAt: state.nextRunAt
  });
}

function broadcastWebsocketMessage(type, payload) {
  const message = JSON.stringify({ type, payload });

  for (const client of websocketClients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

function sendSocketMessage(socket, type, payload) {
  if (socket.readyState !== 1) return;
  socket.send(JSON.stringify({ type, payload }));
}

function setSocketDetailSubscription(socket, containerId) {
  if (containerId) {
    websocketDetailSubscriptions.set(socket, containerId);
    return;
  }

  websocketDetailSubscriptions.delete(socket);
}

function getSubscribedContainerIds() {
  return [...new Set([...websocketDetailSubscriptions.values()].filter(Boolean))];
}

async function broadcastSubscribedContainerDetails() {
  const containerIds = getSubscribedContainerIds();
  if (!containerIds.length) return;

  const detailsById = new Map();

  await Promise.all(
    containerIds.map(async (containerId) => {
      try {
        detailsById.set(containerId, await getContainerDetails(containerId));
      } catch (error) {
        detailsById.set(containerId, { error: error.message });
      }
    })
  );

  for (const [socket, containerId] of websocketDetailSubscriptions.entries()) {
    const detail = detailsById.get(containerId);
    if (!detail) continue;

    if (detail.error) {
      sendSocketMessage(socket, "container-detail-error", {
        containerId,
        error: detail.error,
        at: new Date().toISOString()
      });
      continue;
    }

    sendSocketMessage(socket, "container-detail-update", {
      containerId,
      container: detail,
      at: new Date().toISOString()
    });
  }
}

function broadcastContainerChange(reason) {
  broadcastWebsocketMessage("container-change", {
    reason,
    at: new Date().toISOString()
  });

  void broadcastSubscribedContainerDetails();
}

function broadcastDashboardUpdate(reason, extra = {}) {
  broadcastWebsocketMessage("dashboard-update", {
    reason,
    at: new Date().toISOString(),
    ...extra
  });

  void broadcastSubscribedContainerDetails();
}

function scheduleContainerBroadcast(reason) {
  if (broadcastContainersTimer) {
    clearTimeout(broadcastContainersTimer);
  }

  broadcastContainersTimer = setTimeout(() => {
    broadcastContainersTimer = null;
    broadcastContainerChange(reason);
  }, 150);
}

function startDockerEventBridge() {
  const restart = () => {
    watchDockerContainerEvents(
      () => {
        scheduleContainerBroadcast("docker-event");
      },
      () => {
        setTimeout(restart, 2000);
      }
    );
  };

  restart();
}

websocketServer.on("connection", (socket) => {
  websocketClients.add(socket);
  websocketDetailSubscriptions.delete(socket);
  socket.isAlive = true;

  sendSocketMessage(socket, "ready", {
    ok: true,
    at: new Date().toISOString(),
    subscriptions: ["container-change", "dashboard-update", "container-detail-update"]
  });

  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("message", (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString("utf8"));

      if (message.type === "subscribe-container-detail") {
        const containerId = String(message.containerId || "").trim();

        if (containerId) {
          setSocketDetailSubscription(socket, containerId);
          sendSocketMessage(socket, "container-detail-subscribed", {
            containerId,
            at: new Date().toISOString()
          });
          void broadcastSubscribedContainerDetails();
        }

        return;
      }

      if (message.type === "unsubscribe-container-detail") {
        setSocketDetailSubscription(socket, null);
        sendSocketMessage(socket, "container-detail-unsubscribed", {
          at: new Date().toISOString()
        });
      }
    } catch {
      // Ignore malformed messages from the client.
    }
  });

  socket.on("close", () => {
    websocketClients.delete(socket);
    websocketDetailSubscriptions.delete(socket);
  });

  socket.on("error", () => {
    websocketClients.delete(socket);
    websocketDetailSubscriptions.delete(socket);
  });
});

websocketHeartbeatTimer = setInterval(() => {
  for (const socket of websocketClients) {
    if (!socket.isAlive) {
      websocketClients.delete(socket);
      websocketDetailSubscriptions.delete(socket);

      try {
        socket.terminate();
      } catch {
        // Ignore terminate failures.
      }

      continue;
    }

    socket.isAlive = false;

    try {
      socket.ping();
    } catch {
      websocketClients.delete(socket);
      websocketDetailSubscriptions.delete(socket);
    }
  }
}, 30000);

websocketDetailBroadcastTimer = setInterval(() => {
  void broadcastSubscribedContainerDetails();
}, 4000);

async function executeScan(trigger) {
  if (scanLock) {
    return { skipped: true, reason: "Scan deja en cours" };
  }

  scanLock = true;

  try {
    const result = await runScan();
    const notifyResults = await notifyIfNeeded(settings, result);

    state = {
      ...state,
      lastRunAt: result.scannedAt,
      nextRunAt: computeNextRunAt(settings.schedule.hour, settings.schedule.minute),
      itemsNeedingUpdate: result.updatesCount,
      containers: result.containers,
      lastErrors: result.errors,
      lastTrigger: trigger,
      lastNotificationResults: notifyResults
    };

    saveState(state);
    broadcastDashboardUpdate("scan-finished", {
      trigger,
      scannedAt: result.scannedAt,
      updatesCount: result.updatesCount
    });

    return {
      ok: true,
      result
    };
  } catch (error) {
    state.lastErrors = [{ container: "global", error: error.message }];
    saveState(state);

    return {
      ok: false,
      error: error.message
    };
  } finally {
    scanLock = false;
  }
}

app.get("/api/health", async (_req, res) => {
  try {
    await pingDocker();

    res.json({
      ok: true,
      docker: "reachable"
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      docker: "unreachable",
      error: error.message
    });
  }
});

app.post("/api/auth/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");

  if (!authenticateLogin(username, password)) {
    res.status(401).json({ ok: false, error: "Identifiants invalides" });
    return;
  }

  const token = createSession(username);
  res.setHeader(
    "Set-Cookie",
    `${sessionCookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`
  );

  res.json({ ok: true, username });
});

app.post("/api/auth/logout", (req, res) => {
  destroySessionFromRequest(req);
  res.setHeader("Set-Cookie", `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const username = getUsernameFromRequest(req);

  if (!username) {
    res.status(401).json({ ok: false });
    return;
  }

  res.json({ ok: true, username });
});

app.use("/api", (req, res, next) => {
  if (req.path === "/health" || req.path.startsWith("/auth/")) {
    next();
    return;
  }

  requireAuth(req, res, next);
});

app.get("/api/dashboard", (_req, res) => {
  settings = getSettings();
  state = getState();

  res.json({
    settings,
    state,
    isScanning: scanLock
  });
});

app.get("/api/containers", async (_req, res) => {
  try {
    const containers = await listRunningContainers();

    res.json({
      ok: true,
      containers
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: error.message
    });
  }
});

app.get("/api/containers/:id", async (req, res) => {
  try {
    const details = await getContainerDetails(req.params.id);
    res.json({ ok: true, container: details });
  } catch (error) {
    const status = String(error?.message || "").toLowerCase().includes("no such container") ? 404 : 503;
    res.status(status).json({ ok: false, error: error.message });
  }
});

app.post("/api/settings", (req, res) => {
  const sanitized = sanitizeSettings(req.body || {});
  settings = sanitized;
  saveSettings(settings);
  refreshSchedule();

  res.json({
    ok: true,
    settings,
    nextRunAt: state.nextRunAt
  });
});

app.post("/api/scan", async (req, res) => {
  const trigger = String(req.body?.trigger || "manual");
  const scanResult = await executeScan(trigger);

  if (!scanResult.ok && !scanResult.skipped) {
    res.status(500).json(scanResult);
    return;
  }

  res.json(scanResult);
});

app.post("/api/notifications/test", async (req, res) => {
  try {
    settings = getSettings();
    const channel = String(req.body?.channel || "all");
    const outcomes = await sendTestNotifications(settings, channel);
    res.json({ ok: true, outcomes });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "src/public/index.html"));
});

refreshSchedule();
startDockerEventBridge();
void executeScan("startup");

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`UpdateBoard demarre sur http://localhost:${port}`);
});
