const elements = {
  authGate: document.getElementById("authGate"),
  loginForm: document.getElementById("loginForm"),
  loginUsername: document.getElementById("loginUsername"),
  loginPassword: document.getElementById("loginPassword"),
  authError: document.getElementById("authError"),
  appShell: Array.from(document.querySelectorAll(".app-shell")),
  themeSelect: document.getElementById("themeSelect"),
  logoutBtn: document.getElementById("logoutBtn"),
  metricTotal: document.getElementById("metricTotal"),
  metricUpdates: document.getElementById("metricUpdates"),
  metricLastRun: document.getElementById("metricLastRun"),
  metricNextRun: document.getElementById("metricNextRun"),
  scanStatus: document.getElementById("scanStatus"),
  notifyTestStatus: document.getElementById("notifyTestStatus"),
  scanNowBtn: document.getElementById("scanNowBtn"),
  updatesTableBody: document.getElementById("updatesTableBody"),
  scheduleForm: document.getElementById("scheduleForm"),
  scheduleHour: document.getElementById("scheduleHour"),
  scheduleMinute: document.getElementById("scheduleMinute"),
  notificationsForm: document.getElementById("notificationsForm"),
  errorCard: document.getElementById("errorCard"),
  errorList: document.getElementById("errorList"),
  discordEnabled: document.getElementById("discordEnabled"),
  discordWebhookUrl: document.getElementById("discordWebhookUrl"),
  telegramEnabled: document.getElementById("telegramEnabled"),
  telegramBotToken: document.getElementById("telegramBotToken"),
  telegramChatId: document.getElementById("telegramChatId"),
  emailEnabled: document.getElementById("emailEnabled"),
  emailRecipients: document.getElementById("emailRecipients"),
  smtpHost: document.getElementById("smtpHost"),
  smtpPort: document.getElementById("smtpPort"),
  smtpUser: document.getElementById("smtpUser"),
  smtpPass: document.getElementById("smtpPass"),
  smtpFrom: document.getElementById("smtpFrom"),
  smtpSecure: document.getElementById("smtpSecure"),
  webhookEnabled: document.getElementById("webhookEnabled"),
  webhookUrl: document.getElementById("webhookUrl"),
  testNotificationsBtn: document.getElementById("testNotificationsBtn")
};

let currentSettings = null;

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("fr-FR");
}

function setScanState(isScanning) {
  elements.scanNowBtn.disabled = isScanning;
  elements.scanStatus.textContent = isScanning ? "Scan en cours..." : "Scan inactif";
}

function showAuthenticatedUi(isAuthenticated) {
  elements.authGate.hidden = isAuthenticated;

  for (const node of elements.appShell) {
    node.hidden = !isAuthenticated;
  }
}

function applyTheme(themePreference) {
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = themePreference === "auto" ? (prefersDark ? "dark" : "light") : themePreference;
  document.documentElement.setAttribute("data-theme", resolved);
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (response.status === 401) {
    throw new Error("UNAUTHENTICATED");
  }

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Erreur API");
  }

  return payload;
}

function renderTable(containers = []) {
  const updates = containers.filter((item) => item.needsUpdate);

  if (updates.length === 0) {
    elements.updatesTableBody.innerHTML = '<tr><td colspan="5">Aucune mise a jour disponible.</td></tr>';
    return;
  }

  elements.updatesTableBody.innerHTML = updates
    .map(
      (container) => `
      <tr>
        <td>${container.name}</td>
        <td>${container.image}</td>
        <td>${container.currentVersion || "-"}</td>
        <td>${container.latestVersion || "-"}</td>
        <td><span class="badge badge-warning">Mise a jour</span></td>
      </tr>
    `
    )
    .join("");
}

function renderErrors(errors = []) {
  if (!errors.length) {
    elements.errorCard.hidden = true;
    elements.errorList.innerHTML = "";
    return;
  }

  elements.errorCard.hidden = false;
  elements.errorList.innerHTML = errors.map((item) => `<li>${item.container}: ${item.error}</li>`).join("");
}

function fillSettings(settings) {
  currentSettings = settings;

  elements.scheduleHour.value = settings.schedule.hour;
  elements.scheduleMinute.value = settings.schedule.minute;
  elements.themeSelect.value = settings.ui?.theme || "auto";
  applyTheme(elements.themeSelect.value);

  elements.discordEnabled.checked = settings.notifications.discord.enabled;
  elements.discordWebhookUrl.value = settings.notifications.discord.webhookUrl;

  elements.telegramEnabled.checked = settings.notifications.telegram.enabled;
  elements.telegramBotToken.value = settings.notifications.telegram.botToken;
  elements.telegramChatId.value = settings.notifications.telegram.chatId;

  elements.emailEnabled.checked = settings.notifications.email.enabled;
  elements.emailRecipients.value = settings.notifications.email.recipients;
  elements.smtpHost.value = settings.notifications.email.smtp?.host || "";
  elements.smtpPort.value = settings.notifications.email.smtp?.port || 587;
  elements.smtpUser.value = settings.notifications.email.smtp?.user || "";
  elements.smtpPass.value = settings.notifications.email.smtp?.pass || "";
  elements.smtpFrom.value = settings.notifications.email.smtp?.from || "";
  elements.smtpSecure.checked = Boolean(settings.notifications.email.smtp?.secure);

  elements.webhookEnabled.checked = settings.notifications.webhook.enabled;
  elements.webhookUrl.value = settings.notifications.webhook.url;
}

function buildSettingsPayloadFromForm() {
  return {
    schedule: {
      hour: Number(elements.scheduleHour.value),
      minute: Number(elements.scheduleMinute.value)
    },
    ui: {
      theme: elements.themeSelect.value
    },
    notifications: {
      discord: {
        enabled: elements.discordEnabled.checked,
        webhookUrl: elements.discordWebhookUrl.value
      },
      telegram: {
        enabled: elements.telegramEnabled.checked,
        botToken: elements.telegramBotToken.value,
        chatId: elements.telegramChatId.value
      },
      email: {
        enabled: elements.emailEnabled.checked,
        recipients: elements.emailRecipients.value,
        smtp: {
          host: elements.smtpHost.value,
          port: Number(elements.smtpPort.value || 587),
          user: elements.smtpUser.value,
          pass: elements.smtpPass.value,
          from: elements.smtpFrom.value,
          secure: elements.smtpSecure.checked
        }
      },
      webhook: {
        enabled: elements.webhookEnabled.checked,
        url: elements.webhookUrl.value
      }
    }
  };
}

async function refreshDashboard() {
  const payload = await apiFetch("/api/dashboard", { method: "GET" });

  elements.metricTotal.textContent = String(payload.state.containers.length);
  elements.metricUpdates.textContent = String(payload.state.itemsNeedingUpdate);
  elements.metricLastRun.textContent = formatDate(payload.state.lastRunAt);
  elements.metricNextRun.textContent = formatDate(payload.state.nextRunAt);

  setScanState(payload.isScanning);
  fillSettings(payload.settings);
  renderTable(payload.state.containers);
  renderErrors(payload.state.lastErrors);
}

async function saveSettings() {
  await apiFetch("/api/settings", {
    method: "POST",
    body: JSON.stringify(buildSettingsPayloadFromForm())
  });

  await refreshDashboard();
}

async function runManualScan() {
  setScanState(true);

  await apiFetch("/api/scan", {
    method: "POST",
    body: JSON.stringify({ trigger: "manual" })
  });

  await refreshDashboard();
}

async function testNotifications() {
  elements.notifyTestStatus.hidden = false;
  elements.notifyTestStatus.textContent = "Test en cours...";

  const payload = await apiFetch("/api/notifications/test", {
    method: "POST",
    body: JSON.stringify({ channel: "all" })
  });

  const failed = payload.outcomes.filter((item) => !item.ok);
  if (failed.length === 0) {
    elements.notifyTestStatus.textContent = "Test OK sur les canaux actifs";
    return;
  }

  elements.notifyTestStatus.textContent = `Test partiel: ${failed.map((item) => item.channel).join(", ")}`;
}

async function ensureAuthenticated() {
  try {
    await apiFetch("/api/auth/me", { method: "GET" });
    showAuthenticatedUi(true);
    await refreshDashboard();
  } catch {
    showAuthenticatedUi(false);
  }
}

async function login(username, password) {
  await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

async function logout() {
  await apiFetch("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
}

elements.scanNowBtn.addEventListener("click", async () => {
  try {
    await runManualScan();
  } catch (error) {
    setScanState(false);
    alert(error.message);
  }
});

elements.scheduleForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await saveSettings();
  } catch (error) {
    alert(error.message);
  }
});

elements.notificationsForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await saveSettings();
  } catch (error) {
    alert(error.message);
  }
});

elements.testNotificationsBtn.addEventListener("click", async () => {
  try {
    await saveSettings();
    await testNotifications();
  } catch (error) {
    elements.notifyTestStatus.hidden = false;
    elements.notifyTestStatus.textContent = `Erreur: ${error.message}`;
  }
});

elements.themeSelect.addEventListener("change", async () => {
  applyTheme(elements.themeSelect.value);
  if (currentSettings) {
    try {
      await saveSettings();
    } catch (error) {
      alert(error.message);
    }
  }
});

elements.logoutBtn.addEventListener("click", async () => {
  try {
    await logout();
  } finally {
    showAuthenticatedUi(false);
  }
});

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.authError.hidden = true;

  try {
    await login(elements.loginUsername.value.trim(), elements.loginPassword.value);
    elements.loginPassword.value = "";
    showAuthenticatedUi(true);
    await refreshDashboard();
  } catch (error) {
    elements.authError.hidden = false;
    elements.authError.textContent = error.message === "UNAUTHENTICATED" ? "Identifiants invalides" : error.message;
  }
});

ensureAuthenticated();
