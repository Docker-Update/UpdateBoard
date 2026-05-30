import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SETTINGS, DEFAULT_STATE } from "../defaults.js";

const dataDir = path.resolve(process.cwd(), "data");
const settingsPath = path.join(dataDir, "settings.json");
const statePath = path.join(dataDir, "state.json");

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readJsonFile(filePath, fallback) {
  ensureDataDir();

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), "utf-8");
    return structuredClone(fallback);
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return { ...structuredClone(fallback), ...JSON.parse(raw) };
  } catch {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), "utf-8");
    return structuredClone(fallback);
  }
}

function writeJsonFile(filePath, value) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

export function getSettings() {
  const settings = readJsonFile(settingsPath, DEFAULT_SETTINGS);

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    schedule: {
      ...DEFAULT_SETTINGS.schedule,
      ...(settings.schedule || {})
    },
    ui: {
      ...DEFAULT_SETTINGS.ui,
      ...(settings.ui || {})
    },
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      ...(settings.notifications || {}),
      discord: {
        ...DEFAULT_SETTINGS.notifications.discord,
        ...(settings.notifications?.discord || {})
      },
      telegram: {
        ...DEFAULT_SETTINGS.notifications.telegram,
        ...(settings.notifications?.telegram || {})
      },
      email: {
        ...DEFAULT_SETTINGS.notifications.email,
        ...(settings.notifications?.email || {}),
        smtp: {
          ...DEFAULT_SETTINGS.notifications.email.smtp,
          ...(settings.notifications?.email?.smtp || {})
        }
      },
      webhook: {
        ...DEFAULT_SETTINGS.notifications.webhook,
        ...(settings.notifications?.webhook || {})
      }
    }
  };
}

export function saveSettings(settings) {
  writeJsonFile(settingsPath, settings);
}

export function getState() {
  const state = readJsonFile(statePath, DEFAULT_STATE);

  return {
    ...DEFAULT_STATE,
    ...state,
    containers: Array.isArray(state.containers) ? state.containers : [],
    lastErrors: Array.isArray(state.lastErrors) ? state.lastErrors : []
  };
}

export function saveState(state) {
  writeJsonFile(statePath, state);
}
