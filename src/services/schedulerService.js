import cron from "node-cron";

let activeTask = null;

function buildCronExpression(hour, minute) {
  return `${minute} ${hour} * * *`;
}

export function formatTimeLabel(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function computeNextRunAt(hour, minute) {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next.toISOString();
}

export function startOrReplaceSchedule({ hour, minute, onTick }) {
  if (activeTask) {
    activeTask.stop();
    activeTask.destroy();
  }

  const expression = buildCronExpression(hour, minute);
  activeTask = cron.schedule(expression, onTick, {
    timezone: process.env.TZ || "Europe/Paris"
  });

  return {
    cron: expression,
    nextRunAt: computeNextRunAt(hour, minute)
  };
}
