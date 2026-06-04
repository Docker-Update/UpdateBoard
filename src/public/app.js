const elements = {
  pageTabs: Array.from(document.querySelectorAll(".nav-tab")),
  pages: Array.from(document.querySelectorAll(".dashboard-page")),
  authScreen: document.getElementById("authScreen"),
  dashboardApp: document.getElementById("dashboardApp"),
  loginForm: document.getElementById("loginForm"),
  loginUsername: document.getElementById("loginUsername"),
  loginPassword: document.getElementById("loginPassword"),
  loginStatus: document.getElementById("loginStatus"),
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  themeToggleButtons: Array.from(document.querySelectorAll("[data-theme-toggle]")),
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
  containerDetailPage: document.querySelector('[data-page="containerDetailPage"]'),
  containerDetailBackBtn: document.getElementById("containerDetailBackBtn"),
  containerDetailName: document.getElementById("containerDetailName"),
  containerDetailState: document.getElementById("containerDetailState"),
  containerDetailMeta: document.getElementById("containerDetailMeta"),
  containerDetailCpu: document.getElementById("containerDetailCpu"),
  containerDetailCpuHint: document.getElementById("containerDetailCpuHint"),
  containerDetailMemory: document.getElementById("containerDetailMemory"),
  containerDetailMemoryHint: document.getElementById("containerDetailMemoryHint"),
  containerDetailUptime: document.getElementById("containerDetailUptime"),
  containerDetailUptimeHint: document.getElementById("containerDetailUptimeHint"),
  containerDetailId: document.getElementById("containerDetailId"),
  containerDetailImage: document.getElementById("containerDetailImage"),
  containerDetailStatus: document.getElementById("containerDetailStatus"),
  containerDetailStartedAt: document.getElementById("containerDetailStartedAt"),
  containerDetailMemoryLimit: document.getElementById("containerDetailMemoryLimit"),
  containerDetailMemoryUsage: document.getElementById("containerDetailMemoryUsage"),
  scheduleForm: document.getElementById("scheduleForm"),
  scheduleHour: document.getElementById("scheduleHour"),
  scheduleMinute: document.getElementById("scheduleMinute"),
  notificationsForm: document.getElementById("notificationsForm"),
  advancedNotificationsForm: document.getElementById("advancedNotificationsForm"),
  errorCard: document.getElementById("errors"),
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
let dashboardRefreshTimer = null;
let liveContainerSocket = null;
let liveContainerReconnectTimer = null;
let liveContainerRefreshTimer = null;
let liveContainerRefreshVersion = 0;
let activePage = "analysisPage";
let currentContainerDetailId = readPreference("updateboard.containerDetailId", "");
let currentContainerDetailLoadVersion = 0;
let currentThemePreference = readPreference("updateboard.theme", "auto");

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

function getResolvedTheme(themePreference) {
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return themePreference === "auto" ? (prefersDark ? "dark" : "light") : themePreference;
}

function syncThemeToggleButtons(resolvedTheme) {
  const label = resolvedTheme === "dark" ? "Mode jour" : "Mode nuit";

  for (const button of elements.themeToggleButtons) {
    const labelNode = button.querySelector(".theme-toggle-label");

    if (labelNode) {
      labelNode.textContent = label;
    }

    button.setAttribute("aria-label", resolvedTheme === "dark" ? "Passer en mode jour" : "Passer en mode nuit");
    button.dataset.theme = resolvedTheme;
  }
}

function applyTheme(themePreference) {
  const resolved = getResolvedTheme(themePreference);
  document.documentElement.setAttribute("data-theme", resolved);
  currentThemePreference = themePreference;
  writePreference("updateboard.theme", themePreference);
  syncThemeToggleButtons(resolved);
}

function setLoggedOutView() {
  elements.authScreen.hidden = false;
  elements.dashboardApp.hidden = true;
  clearAutoRefresh();
  if (dashboardRefreshTimer) {
    window.clearTimeout(dashboardRefreshTimer);
    dashboardRefreshTimer = null;
  }
  clearLiveContainerRefresh();
  currentSettings = null;
  currentContainers = [];
  currentContainerDetailId = "";
  unsubscribeFromContainerDetail();
  setScanState(false);
}

function setLoggedInView() {
  elements.authScreen.hidden = true;
  elements.dashboardApp.hidden = false;
}

function getActiveThemeLabel() {
  return getResolvedTheme(currentThemePreference) === "dark" ? "Jour" : "Nuit";
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

  if (pageId === "containersPage") {
    currentContainerDetailLoadVersion += 1;
    currentContainerDetailId = "";
    unsubscribeFromContainerDetail();
    resetContainerDetailView();
    void refreshLiveContainers().catch(() => {
      // Ignore transient container refresh failures when switching tabs.
    });
  } else if (pageId === "containerDetailPage" && currentContainerDetailId) {
    subscribeToContainerDetail(currentContainerDetailId);
    void refreshContainerDetail().catch(() => {
      // Keep detail navigation silent when the API is temporarily unavailable.
    });
  } else {
    unsubscribeFromContainerDetail();
  }
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("fr-FR");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "-";

  const abs = Math.abs(bytes);
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let unitIndex = 0;
  let value = abs;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const formatted = Number(value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2));
  return `${bytes < 0 ? "-" : ""}${formatted} ${units[unitIndex]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "-";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}j ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function setContainerDetailBadge(state) {
  if (!elements.containerDetailState) return;

  const normalized = String(state || "").toLowerCase();
  const isHealthy = normalized === "running" || normalized === "en cours";
  const isWarning = normalized === "paused" || normalized === "restarting";

  elements.containerDetailState.classList.remove("badge-ok", "badge-warning");
  elements.containerDetailState.classList.add(isWarning ? "badge-warning" : "badge-ok");
  elements.containerDetailState.textContent = formatDockerState(state);
  elements.containerDetailState.dataset.state = isHealthy ? "ok" : isWarning ? "warning" : "error";
}

function resetContainerDetailView(message = "Clique sur un container pour voir ses statistiques.") {
  if (elements.containerDetailName) elements.containerDetailName.textContent = "Container";
  if (elements.containerDetailState) {
    elements.containerDetailState.classList.remove("badge-warning");
    elements.containerDetailState.classList.add("badge-ok");
    elements.containerDetailState.textContent = "En cours";
    elements.containerDetailState.dataset.state = "ok";
  }
  if (elements.containerDetailMeta) elements.containerDetailMeta.textContent = message;
  if (elements.containerDetailCpu) elements.containerDetailCpu.textContent = "0%";
  if (elements.containerDetailCpuHint) elements.containerDetailCpuHint.textContent = "Charge CPU actuelle";
  if (elements.containerDetailMemory) elements.containerDetailMemory.textContent = "0%";
  if (elements.containerDetailMemoryHint) elements.containerDetailMemoryHint.textContent = "- / -";
  if (elements.containerDetailUptime) elements.containerDetailUptime.textContent = "-";
  if (elements.containerDetailUptimeHint) elements.containerDetailUptimeHint.textContent = "Depuis le démarrage";
  if (elements.containerDetailId) elements.containerDetailId.textContent = "-";
  if (elements.containerDetailImage) elements.containerDetailImage.textContent = "-";
  if (elements.containerDetailStatus) elements.containerDetailStatus.textContent = "-";
  if (elements.containerDetailStartedAt) elements.containerDetailStartedAt.textContent = "-";
  if (elements.containerDetailMemoryLimit) elements.containerDetailMemoryLimit.textContent = "-";
  if (elements.containerDetailMemoryUsage) elements.containerDetailMemoryUsage.textContent = "-";
}

function renderContainerDetail(container, details) {
  if (!container || !details) return;

  const memoryUsage = details.memory?.usage?.value != null ? `${details.memory.usage.value} ${details.memory.usage.unit}` : formatBytes(details.memory?.usageBytes || 0);
  const memoryLimit = details.memory?.limit?.value != null ? `${details.memory.limit.value} ${details.memory.limit.unit}` : formatBytes(details.memory?.limitBytes || 0);

  elements.containerDetailName.textContent = container.name || details.name || "Container";
  elements.containerDetailMeta.textContent = `${container.image || details.image || "Image inconnue"} · ${container.shortId || details.shortId || "-"}`;
  setContainerDetailBadge(details.state || details.status);

  elements.containerDetailCpu.textContent = `${Number(details.cpu?.percent || 0).toFixed(1)}%`;
  elements.containerDetailCpuHint.textContent = `Charge CPU actuelle`;
  elements.containerDetailMemory.textContent = `${Number(details.memory?.percent || 0).toFixed(1)}%`;
  elements.containerDetailMemoryHint.textContent = `${memoryUsage || "-"} / ${memoryLimit || "-"}`;
  elements.containerDetailUptime.textContent = formatDuration(details.uptimeSeconds || 0);
  elements.containerDetailUptimeHint.textContent = details.startedAt ? `Démarré le ${formatDate(details.startedAt)}` : "Démarrage inconnu";
  elements.containerDetailId.textContent = details.shortId || container.shortId || details.id || "-";
  elements.containerDetailImage.textContent = container.image || details.image || "-";
  elements.containerDetailStatus.textContent = formatDockerState(details.state, details.running ? "En cours" : details.status);
  elements.containerDetailStartedAt.textContent = details.startedAt ? formatDate(details.startedAt) : "-";
  elements.containerDetailMemoryLimit.textContent = memoryLimit || "-";
  elements.containerDetailMemoryUsage.textContent = memoryUsage || "-";
}

async function refreshContainerDetail() {
  if (!currentContainerDetailId) {
    return;
  }

  const loadVersion = ++currentContainerDetailLoadVersion;

  const container = currentContainers.find((item) => item.id === currentContainerDetailId);

  if (elements.containerDetailName) {
    elements.containerDetailName.textContent = container?.name || currentContainerDetailId.slice(0, 12);
  }

  if (elements.containerDetailMeta) {
    elements.containerDetailMeta.textContent = "Chargement des statistiques...";
  }

  const payload = await apiFetch(`/api/containers/${currentContainerDetailId}`, { method: "GET" });
  if (loadVersion !== currentContainerDetailLoadVersion || activePage !== "containerDetailPage" || payload?.container?.id !== currentContainerDetailId) {
    return;
  }
  renderContainerDetail(container || payload.container, payload.container);
}

async function openContainerDetail(containerId) {
  currentContainerDetailLoadVersion += 1;
  currentContainerDetailId = containerId;
  writePreference("updateboard.containerDetailId", containerId);
  resetContainerDetailView("Chargement des statistiques...");
  setActivePage("containerDetailPage");
  subscribeToContainerDetail(containerId);

  try {
    await refreshContainerDetail();
  } catch (error) {
    if (error.status === 404) {
      elements.containerDetailMeta.textContent = "Ce container n'est plus disponible.";
      return;
    }

    elements.containerDetailMeta.textContent = `Erreur: ${error.message}`;
  }
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

function clearLiveContainerRefresh() {
  if (liveContainerRefreshTimer) {
    window.clearTimeout(liveContainerRefreshTimer);
    liveContainerRefreshTimer = null;
  }

  if (liveContainerReconnectTimer) {
    window.clearTimeout(liveContainerReconnectTimer);
    liveContainerReconnectTimer = null;
  }

  if (liveContainerSocket) {
    liveContainerSocket.onopen = null;
    liveContainerSocket.onmessage = null;
    liveContainerSocket.onclose = null;
    liveContainerSocket.onerror = null;
    liveContainerSocket.close();
    liveContainerSocket = null;
  }
}

function sendLiveSocketMessage(type, payload = {}) {
  if (!liveContainerSocket || liveContainerSocket.readyState !== WebSocket.OPEN) {
    return false;
  }

  liveContainerSocket.send(JSON.stringify({ type, ...payload }));
  return true;
}

function subscribeToContainerDetail(containerId) {
  if (!containerId) return;
  sendLiveSocketMessage("subscribe-container-detail", { containerId });
}

function unsubscribeFromContainerDetail() {
  sendLiveSocketMessage("unsubscribe-container-detail");
}

function applyLiveContainerRefresh() {
  clearLiveContainerRefresh();

  if (!("WebSocket" in window)) return;

  const connect = () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    liveContainerSocket = socket;

    socket.onopen = () => {
      if (currentContainerDetailId && activePage === "containerDetailPage") {
        subscribeToContainerDetail(currentContainerDetailId);
      }
    };

    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "container-change") {
          scheduleLiveContainerRefresh();
        } else if (message.type === "dashboard-update") {
          scheduleDashboardRefresh();
        } else if (message.type === "container-detail-update") {
          if (message.payload?.containerId === currentContainerDetailId && activePage === "containerDetailPage") {
            const detail = message.payload.container;
            const container = currentContainers.find((item) => item.id === currentContainerDetailId);
            renderContainerDetail(container || detail, detail);
          }
        } else if (message.type === "container-detail-error") {
          if (message.payload?.containerId === currentContainerDetailId && activePage === "containerDetailPage") {
            elements.containerDetailMeta.textContent = `Erreur websocket: ${message.payload.error}`;
          }
        }
      } catch {
        // Ignore malformed payloads and keep the socket alive.
      }
    };

    socket.onclose = () => {
      if (liveContainerSocket !== socket) return;
      liveContainerSocket = null;

      liveContainerReconnectTimer = window.setTimeout(() => {
        liveContainerReconnectTimer = null;
        connect();
      }, 1000);
    };

    socket.onerror = () => {
      try {
        socket.close();
      } catch {
        // Ignore close failures.
      }
    };
  };

  connect();
}

function scheduleLiveContainerRefresh() {
  if (liveContainerRefreshTimer) {
    window.clearTimeout(liveContainerRefreshTimer);
  }

  liveContainerRefreshTimer = window.setTimeout(() => {
    liveContainerRefreshTimer = null;
    void refreshLiveContainers().catch(() => {
      // Keep websocket-driven refreshes silent when the API is temporarily unavailable.
    });
  }, 200);
}

function scheduleDashboardRefresh() {
  if (dashboardRefreshTimer) {
    window.clearTimeout(dashboardRefreshTimer);
  }

  dashboardRefreshTimer = window.setTimeout(() => {
    dashboardRefreshTimer = null;
    void refreshDashboardAndLiveContainers().catch(() => {
      // Keep websocket-driven refreshes silent when the API is temporarily unavailable.
    });
  }, 200);
}

function mergeLiveContainerState(liveContainers) {
  const liveById = new Map(liveContainers.map((container) => [container.id, container]));
  const merged = currentContainers.map((container) => {
    const live = liveById.get(container.id);

    if (!live) {
      return container;
    }

    const liveState = String(live.state || "").toLowerCase();
    const currentState = String(container.state || "").toLowerCase();
    const allowLiveStateUpdate = liveState !== "running" || currentState === "running";

    return {
      ...container,
      status: allowLiveStateUpdate ? live.status ?? container.status : container.status,
      state: allowLiveStateUpdate ? live.state ?? container.state : container.state,
      image: container.image || live.image,
      shortId: live.shortId || container.shortId,
      name: live.name || container.name,
      id: live.id || container.id
    };
  });

  const seenIds = new Set(merged.map((container) => container.id));

  for (const live of liveContainers) {
    if (seenIds.has(live.id)) {
      continue;
    }

    merged.push(live);
  }

  return merged;
}

function formatDockerState(state, status) {
  const normalizedState = String(state || "").toLowerCase();

  if (normalizedState === "running") return "En cours";
  if (normalizedState === "paused") return "En pause";
  if (normalizedState === "restarting") return "Redemarrage";
  if (normalizedState === "created") return "Cree";
  if (normalizedState === "exited") return "Arrete";
  if (normalizedState === "dead") return "Mort";

  return status || state || "-";
}

function getFilteredContainers() {
  const query = (elements.searchInput.value || "").trim().toLowerCase();
  const status = activePage === "containersPage" ? "all" : elements.statusFilter.value;

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
      <tr data-container-id="${container.id}" tabindex="0" role="button" aria-label="Voir les details de ${container.name}">
        <td><span class="container-link">${container.name}</span></td>
        <td>${container.image}</td>
        <td>${container.currentVersion || "-"}</td>
        <td>${container.latestVersion || "-"}</td>
        <td>
          <div class="state-stack">
            <span>${formatDockerState(container.state, container.status)}</span>
            ${
            container.needsUpdate
              ? '<span class="badge badge-warning">Mise a jour</span>'
              : '<span class="badge badge-ok">OK</span>'
          }
          </div>
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
  if (!elements.errorCard || !elements.errorList) return;

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
  applyTheme(settings.ui?.theme || currentThemePreference || "auto");

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
      theme: currentThemePreference
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
    const error = new Error(payload?.error || `Erreur API (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function refreshDockerHealth() {
  try {
    await apiFetch("/api/health", { method: "GET" });
    setDockerStatus(true, "Docker accessible");
  } catch (error) {
    if (error.status === 401) {
      setLoggedOutView();
      return;
    }

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

async function refreshLiveContainers() {
  const requestVersion = ++liveContainerRefreshVersion;
  const payload = await apiFetch("/api/containers", { method: "GET" });

  if (requestVersion !== liveContainerRefreshVersion) {
    return;
  }

  const liveContainers = Array.isArray(payload.containers) ? payload.containers : [];
  currentContainers = mergeLiveContainerState(liveContainers);
  renderTable();
}

async function refreshDashboardAndLiveContainers() {
  await refreshDashboard();
  await refreshLiveContainers();

  if (activePage === "containerDetailPage" && currentContainerDetailId) {
    await refreshContainerDetail();
  }
}

async function saveSettings() {
  await apiFetch("/api/settings", {
    method: "POST",
    body: JSON.stringify(buildSettingsPayloadFromForm())
  });

  await refreshDashboardAndLiveContainers();
}

async function runManualScan() {
  setScanState(true);
  await apiFetch("/api/scan", {
    method: "POST",
    body: JSON.stringify({ trigger: "manual" })
  });
  await refreshDashboardAndLiveContainers();
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

async function loadDashboard() {
  setLoggedInView();
  applyLiveContainerRefresh();
  await refreshDockerHealth();
  await refreshDashboardAndLiveContainers();
  applyAutoRefresh(Number(readPreference("updateboard.autoRefresh", "30")));
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

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.loginStatus.textContent = "Connexion en cours...";

  try {
    await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: elements.loginUsername.value,
        password: elements.loginPassword.value
      })
    });

    elements.loginPassword.value = "";
    elements.loginStatus.textContent = "Connexion réussie.";
    await loadDashboard();
  } catch (error) {
    elements.loginStatus.textContent = error.status === 401 ? "Identifiants invalides." : `Erreur: ${error.message}`;
  }
});

for (const button of elements.themeToggleButtons) {
  button.addEventListener("click", async () => {
    const resolved = getResolvedTheme(currentThemePreference);
    const nextTheme = resolved === "dark" ? "light" : "dark";
    applyTheme(nextTheme);

    if (!currentSettings) {
      return;
    }

    try {
      await saveSettings();
    } catch (error) {
      alert(error.message);
    }
  });
}

elements.logoutBtn.addEventListener("click", async () => {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Logout should still clear the local UI state even if the server rejects the call.
  }

  setLoggedOutView();
  elements.loginStatus.textContent = "Déconnecté.";
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

function handleContainerRowActivation(event) {
  const row = event.target.closest?.("tr[data-container-id]");
  if (!row) return;

  const containerId = row.dataset.containerId;
  if (!containerId) return;

  void openContainerDetail(containerId).catch((error) => {
    elements.containerDetailMeta.textContent = `Erreur: ${error.message}`;
  });
}

elements.updatesTableBody.addEventListener("click", handleContainerRowActivation);
if (elements.updatesTableBodyMirror) {
  elements.updatesTableBodyMirror.addEventListener("click", handleContainerRowActivation);
}

for (const tableBody of [elements.updatesTableBody, elements.updatesTableBodyMirror].filter(Boolean)) {
  tableBody.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleContainerRowActivation(event);
  });
}

if (elements.containerDetailBackBtn) {
  elements.containerDetailBackBtn.addEventListener("click", () => {
    setActivePage("containersPage");
  });
}

elements.autoRefreshSelect.addEventListener("change", () => {
  const value = Number(elements.autoRefreshSelect.value || 0);
  applyAutoRefresh(value);
});

elements.refreshBtn.addEventListener("click", async () => {
  try {
    await refreshDockerHealth();
    await refreshDashboardAndLiveContainers();
  } catch (error) {
    alert(error.message);
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && activePage === "containersPage") {
    void refreshLiveContainers();
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
    const storedFilter = readPreference("updateboard.statusFilter", "all");
    const storedPage = readPreference("updateboard.page", "analysisPage");
    const storedDetailId = readPreference("updateboard.containerDetailId", "");

    elements.autoRefreshSelect.value = String(storedAutoRefresh);
    elements.searchInput.value = storedSearch;
    elements.statusFilter.value = storedFilter;

    applyTheme(storedTheme);
    syncThemeToggleButtons(getResolvedTheme(storedTheme));

    await apiFetch("/api/auth/me", { method: "GET" });
    setLoggedInView();
    applyLiveContainerRefresh();
    if (storedPage === "containerDetailPage" && !storedDetailId) {
      setActivePage("containersPage");
    } else {
      setActivePage(storedPage);
    }
    await refreshDockerHealth();
    await refreshDashboardAndLiveContainers();
    applyAutoRefresh(storedAutoRefresh);
  } catch (error) {
    if (error.status === 401) {
      setLoggedOutView();
      setActivePage("analysisPage");
      elements.loginStatus.textContent = "Connecte-toi pour accéder au dashboard.";
      elements.loginUsername.focus();
      return;
    }

    elements.updatesTableBody.innerHTML = `<tr><td colspan="5">Erreur: ${error.message}</td></tr>`;
    if (elements.updatesTableBodyMirror) {
      elements.updatesTableBodyMirror.innerHTML = `<tr><td colspan="5">Erreur: ${error.message}</td></tr>`;
    }
    setTableSummary(0, 0, 0);
  }
}

bootstrap();
