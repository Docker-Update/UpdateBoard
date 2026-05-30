import nodemailer from "nodemailer";

function buildUpdateMessage(result) {
  const lines = [
    "Mises a jour Docker detectees:",
    ...result.containers
      .filter((container) => container.needsUpdate)
      .map(
        (container) =>
          `- ${container.name}: ${container.currentVersion} -> ${container.latestVersion || "inconnue"}`
      )
  ];

  return lines.join("\n");
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
}

async function sendDiscord(config, message) {
  await postJson(config.webhookUrl, { content: message });
}

async function sendTelegram(config, message) {
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  await postJson(url, {
    chat_id: config.chatId,
    text: message
  });
}

async function sendEmail(config, message) {
  const host = config.smtp?.host || process.env.SMTP_HOST;
  const port = Number(config.smtp?.port || process.env.SMTP_PORT || 587);
  const user = config.smtp?.user || process.env.SMTP_USER;
  const pass = config.smtp?.pass || process.env.SMTP_PASS;
  const from = config.smtp?.from || process.env.SMTP_FROM || "UpdateBoard <noreply@example.com>";
  const secure =
    typeof config.smtp?.secure === "boolean"
      ? config.smtp.secure
      : String(process.env.SMTP_SECURE || "false") === "true";

  if (!host || !user || !pass) {
    throw new Error("Variables SMTP_HOST/SMTP_USER/SMTP_PASS manquantes");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });

  await transporter.sendMail({
    from,
    to: config.recipients,
    subject: "UpdateBoard - Mises a jour Docker disponibles",
    text: message
  });
}

async function sendWebhook(config, message, result) {
  await postJson(config.url, {
    type: "docker-updates",
    generatedAt: new Date().toISOString(),
    message,
    updates: result.containers.filter((container) => container.needsUpdate)
  });
}

async function sendByChannel(channelKey, settings, message, result) {
  switch (channelKey) {
    case "discord":
      await sendDiscord(settings.notifications.discord, message);
      return;
    case "telegram":
      await sendTelegram(settings.notifications.telegram, message);
      return;
    case "email":
      await sendEmail(settings.notifications.email, message);
      return;
    case "webhook":
      await sendWebhook(settings.notifications.webhook, message, result);
      return;
    default:
      throw new Error(`Canal non supporte: ${channelKey}`);
  }
}

function getEnabledChannels(settings) {
  return [
    {
      key: "discord",
      enabled: settings.notifications.discord.enabled && Boolean(settings.notifications.discord.webhookUrl)
    },
    {
      key: "telegram",
      enabled:
        settings.notifications.telegram.enabled &&
        Boolean(settings.notifications.telegram.botToken) &&
        Boolean(settings.notifications.telegram.chatId)
    },
    {
      key: "email",
      enabled: settings.notifications.email.enabled && Boolean(settings.notifications.email.recipients)
    },
    {
      key: "webhook",
      enabled: settings.notifications.webhook.enabled && Boolean(settings.notifications.webhook.url)
    }
  ].filter((item) => item.enabled);
}

export async function notifyIfNeeded(settings, result) {
  const updates = result.containers.filter((container) => container.needsUpdate);
  if (updates.length === 0) {
    return [];
  }

  const message = buildUpdateMessage(result);
  const outcomes = [];

  const channels = getEnabledChannels(settings);

  for (const channel of channels) {
    try {
      await sendByChannel(channel.key, settings, message, result);
      outcomes.push({ channel: channel.key, ok: true });
    } catch (error) {
      outcomes.push({ channel: channel.key, ok: false, error: error.message });
    }
  }

  return outcomes;
}

export async function sendTestNotifications(settings, selectedChannel = "all") {
  const result = {
    containers: [
      {
        name: "example-container",
        currentVersion: "1.0.0",
        latestVersion: "1.1.0",
        needsUpdate: true
      }
    ]
  };
  const message = "Test UpdateBoard: une mise a jour Docker a ete detectee.";
  const enabledChannels = getEnabledChannels(settings);
  const channels =
    selectedChannel === "all"
      ? enabledChannels
      : enabledChannels.filter((item) => item.key === selectedChannel);

  if (channels.length === 0) {
    return [{ channel: selectedChannel, ok: false, error: "Aucun canal actif pour ce test" }];
  }

  const outcomes = [];

  for (const channel of channels) {
    try {
      await sendByChannel(channel.key, settings, message, result);
      outcomes.push({ channel: channel.key, ok: true });
    } catch (error) {
      outcomes.push({ channel: channel.key, ok: false, error: error.message });
    }
  }

  return outcomes;
}
