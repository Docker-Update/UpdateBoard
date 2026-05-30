import path from "node:path";
import express from "express";
import dotenv from "dotenv";
import { DEFAULT_SETTINGS } from "./defaults.js";
import {
  authenticateLogin,
  createSession,
  destroySessionFromRequest,
  getSessionCookieName,
  getUsernameFromRequest,
  requireAuth
} from "./utils/auth.js";
import { pingDocker } from "./services/dockerService.js";
import { notifyIfNeeded, sendTestNotifications } from "./services/notifierService.js";
import { runScan } from "./services/scanService.js";
import { computeNextRunAt, startOrReplaceSchedule } from "./services/schedulerService.js";
import { getSettings, getState, saveSettings, saveState } from "./utils/store.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8080);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.resolve(process.cwd(), "src/public")));

let settings = getSettings();
let state = getState();
let scanLock = false;

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
}

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
    `${sessionCookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 24 * 30}`
  );

  res.json({ ok: true, username });
});

app.post("/api/auth/logout", (req, res) => {
  destroySessionFromRequest(req);
  res.setHeader("Set-Cookie", `${sessionCookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
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
void executeScan("startup");

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`UpdateBoard demarre sur http://localhost:${port}`);
});
