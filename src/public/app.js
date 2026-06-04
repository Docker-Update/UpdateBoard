const elements = {
  pageTabs: Array.from(document.querySelectorAll(".nav-tab")),
  pages: Array.from(document.querySelectorAll(".dashboard-page")),
  themeSelect: document.getElementById("themeSelect"),
  autoRefreshSelect: document.getElementById("autoRefreshSelect"),
  refreshBtn: document.getElementById("refreshBtn"),
  dockerStatus: document.getElementById("dockerStatus"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  tableSummary: document.getElementById("tableSummary"),
  metricTotal: document.getElementById("metricTotal"),
  metricUpdates: document.getElementById("metricUpdates"),
  metricLastRun: document.getElementById("metricLastRun"),
  metricNextRun: document.getElementById("metricNextRun"),
  scanStatus: document.getElementById("scanStatus"),
  notifyTestStatus: document.getElementById("notifyTestStatus"),
  scanNowBtn: document.getElementById("scanNowBtn"),
  updatesTableBody: document.getElementById("updatesTableBody"),
  updatesTableBodyMirror: document.getElementById("updatesTableBodyMirror"),
  scheduleForm: document.getElementById("scheduleForm"),
  scheduleHour: document.getElementById("scheduleHour"),
  scheduleMinute: document.getElementById("scheduleMinute"),
  notificationsForm: document.getElementById("notificationsForm"),
  advancedNotificationsForm: document.getElementById("advancedNotificationsForm"),
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
let currentContainers = [];
let autoRefreshTimer = null;
let activePage = "analysisPage";

function readPreference(key, fallback) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writePreference(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors in private mode or restricted contexts.
  }
}

function setActivePage(pageId) {
  activePage = pageId;
  writePreference("updateboard.page", pageId);

  for (const tab of elements.pageTabs) {
    const isActive = tab.dataset.pageTarget === pageId;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-pressed", String(isActive));
  }

  for (const page of elements.pages) {
    const isVisible = page.dataset.page === pageId;
    page.hidden = !isVisible;
    page.classList.toggle("is-active", isVisible);
  }
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("fr-FR");
}

function applyTheme(themePreference) {
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = themePreference === "auto" ? (prefersDark ? "dark" : "light") : themePreference;
  document.documentElement.setAttribute("data-theme", resolved);
  writePreference("updateboard.theme", themePreference);
}

function setScanState(isScanning) {
  elements.scanNowBtn.disabled = isScanning;
  elements.scanStatus.textContent = isScanning ? "Scan en cours..." : "Scan inactif";
}

function setDockerStatus(isHealthy, message) {
  if (!elements.dockerStatus) return;

  elements.dockerStatus.textContent = message;
  elements.dockerStatus.dataset.state = isHealthy ? "ok" : "error";
}

function setTableSummary(visibleCount, totalCount, outdatedCount) {
  elements.tableSummary.textContent = `${visibleCount} visible(s) / ${totalCount} total - ${outdatedCount} a mettre a jour`;
}

function getFilteredContainers() {
  const query = (elements.searchInput.value || "").trim().toLowerCase();
  const status = elements.statusFilter.value;

  let items = [...currentContainers];
  if (status === "outdated") {
    items = items.filter((item) => item.needsUpdate);
  }

  if (status === "clean") {
    items = items.filter((item) => !item.needsUpdate);
  }

  if (query) {
    items = items.filter((item) => {
      const name = String(item.name || "").toLowerCase();
      const image = String(item.image || "").toLowerCase();
      return name.includes(query) || image.includes(query);
    });
  }

  return items;
}

function renderTable() {
  const visible = getFilteredContainers();
  const outdatedCount = currentContainers.filter((item) => item.needsUpdate).length;

  if (!visible.length) {
    const emptyRow = '<tr><td colspan="5">Aucun resultat pour ce filtre.</td></tr>';
    elements.updatesTableBody.innerHTML = emptyRow;
    if (elements.updatesTableBodyMirror) {
      elements.updatesTableBodyMirror.innerHTML = emptyRow;
    }
    setTableSummary(0, currentContainers.length, outdatedCount);
    return;
  }

  const tableHtml = visible
    .map(
      (container) => `
      <tr>
        <td>${container.name}</td>
        <td>${container.image}</td>
        <td>${container.currentVersion || "-"}</td>
        <td>${container.latestVersion || "-"}</td>
        <td>
          ${
            container.needsUpdate
              ? '<span class="badge badge-warning">Mise a jour</span>'
              : '<span class="badge badge-ok">OK</span>'
          }
        </td>
      </tr>
    `
    )
    .join("");

  elements.updatesTableBody.innerHTML = tableHtml;
  if (elements.updatesTableBodyMirror) {
    elements.updatesTableBodyMirror.innerHTML = tableHtml;
  }

  setTableSummary(visible.length, currentContainers.length, outdatedCount);
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

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Erreur API (${response.status})`);
  }

  return payload;
}

async function refreshDockerHealth() {
  try {
    await apiFetch("/api/health", { method: "GET" });
    setDockerStatus(true, "Docker accessible");
  } catch (error) {
    setDockerStatus(false, `Docker indisponible: ${error.message}`);
  }
}

async function refreshDashboard() {
  const payload = await apiFetch("/api/dashboard", { method: "GET" });

  elements.metricTotal.textContent = String(payload.state.containers.length);
  elements.metricUpdates.textContent = String(payload.state.itemsNeedingUpdate);
  elements.metricLastRun.textContent = formatDate(payload.state.lastRunAt);
  elements.metricNextRun.textContent = formatDate(payload.state.nextRunAt);

  setScanState(payload.isScanning);
  fillSettings(payload.settings);
  currentContainers = Array.isArray(payload.state.containers) ? payload.state.containers : [];
  renderTable();
  renderErrors(payload.state.lastErrors || []);
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
  elements.notifyTestStatus.textContent = failed.length
    ? `Test partiel: ${failed.map((item) => item.channel).join(", ")}`
    : "Test OK sur les canaux actifs";
}

function exportVisibleRowsToJson() {
  const visible = getFilteredContainers();
  const blob = new Blob([JSON.stringify(visible, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `updateboard-export-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearAutoRefresh() {
  if (!autoRefreshTimer) return;
  window.clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
}

function applyAutoRefresh(seconds) {
  clearAutoRefresh();
  writePreference("updateboard.autoRefresh", String(seconds || 0));
  if (!seconds || seconds <= 0) return;

  autoRefreshTimer = window.setInterval(async () => {
    try {
      await refreshDashboard();
    } catch {
      // Silent to keep UI stable during transient API errors.
    }
  }, seconds * 1000);
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

if (elements.advancedNotificationsForm) {
  elements.advancedNotificationsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveSettings();
    } catch (error) {
      alert(error.message);
    }
  });
}

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
  if (!currentSettings) return;
  try {
    await saveSettings();
  } catch (error) {
    alert(error.message);
  }
});

elements.searchInput.addEventListener("input", () => {
  writePreference("updateboard.search", elements.searchInput.value || "");
  renderTable();
});

elements.statusFilter.addEventListener("change", () => {
  writePreference("updateboard.statusFilter", elements.statusFilter.value);
  renderTable();
});

elements.exportJsonBtn.addEventListener("click", () => {
  exportVisibleRowsToJson();
});

elements.autoRefreshSelect.addEventListener("change", () => {
  const value = Number(elements.autoRefreshSelect.value || 0);
  applyAutoRefresh(value);
});

elements.refreshBtn.addEventListener("click", async () => {
  try {
    await refreshDockerHealth();
    await refreshDashboard();
  } catch (error) {
    alert(error.message);
  }
});

for (const tab of elements.pageTabs) {
  tab.addEventListener("click", () => {
    const targetPage = tab.dataset.pageTarget;
    if (targetPage) {
      setActivePage(targetPage);
    }
  });
}

async function bootstrap() {
  try {
    const storedTheme = readPreference("updateboard.theme", "auto");
    const storedAutoRefresh = Number(readPreference("updateboard.autoRefresh", "30"));
    const storedSearch = readPreference("updateboard.search", "");
    const storedFilter = readPreference("updateboard.statusFilter", "outdated");
    const storedPage = readPreference("updateboard.page", "analysisPage");

    elements.themeSelect.value = storedTheme;
    elements.autoRefreshSelect.value = String(storedAutoRefresh);
    elements.searchInput.value = storedSearch;
    elements.statusFilter.value = storedFilter;

    applyTheme(storedTheme);
    setActivePage(storedPage);
    await refreshDockerHealth();
    await refreshDashboard();
    applyAutoRefresh(storedAutoRefresh);
  } catch (error) {
    elements.updatesTableBody.innerHTML = `<tr><td colspan="5">Erreur: ${error.message}</td></tr>`;
    if (elements.updatesTableBodyMirror) {
      elements.updatesTableBodyMirror.innerHTML = `<tr><td colspan="5">Erreur: ${error.message}</td></tr>`;
    }
    setTableSummary(0, 0, 0);
  }
}

bootstrap();
