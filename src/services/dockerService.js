import Docker from "dockerode";

const socketPath = process.platform === "win32" ? "//./pipe/docker_engine" : "/var/run/docker.sock";
const docker = new Docker({ socketPath });

export async function listRunningContainers() {
  const containers = await docker.listContainers({ all: true });

  return containers
    .filter((item) => {
      const containerName = item.Names?.[0]?.replace(/^\//, "") || item.Id.slice(0, 12);
      return containerName !== "updateboard" && item.Image !== "updateboard-updateboard";
    })
    .map((item) => ({
      id: item.Id,
      shortId: item.Id.slice(0, 12),
      name: item.Names?.[0]?.replace(/^\//, "") || item.Id.slice(0, 12),
      image: item.Image,
      status: item.Status,
      state: item.State
    }));
}

function getContainerById(containerId) {
  return docker.getContainer(containerId);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes === 0) return { value: 0, unit: "Mo" };

  const units = ["o", "Ko", "Mo", "Go", "To"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return {
    value: Number(value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)),
    unit: units[unitIndex]
  };
}

function formatCpuPercent(containerStats) {
  const cpuTotal = containerStats?.cpu_stats?.cpu_usage?.total_usage;
  const systemTotal = containerStats?.cpu_stats?.system_cpu_usage;
  const previousCpuTotal = containerStats?.precpu_stats?.cpu_usage?.total_usage;
  const previousSystemTotal = containerStats?.precpu_stats?.system_cpu_usage;
  const cpuDelta = Number(cpuTotal) - Number(previousCpuTotal);
  const systemDelta = Number(systemTotal) - Number(previousSystemTotal);
  const cpuCount = containerStats?.cpu_stats?.online_cpus || containerStats?.cpu_stats?.cpu_usage?.percpu_usage?.length || 1;

  if (!Number.isFinite(cpuDelta) || !Number.isFinite(systemDelta) || cpuDelta < 0 || systemDelta <= 0) {
    return 0;
  }

  return (cpuDelta / systemDelta) * cpuCount * 100;
}

function toPromisedStats(container) {
  return new Promise((resolve, reject) => {
    container.stats({ stream: false }, (error, data) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(data);
    });
  });
}

export async function getContainerDetails(containerId) {
  const container = getContainerById(containerId);
  const inspect = await container.inspect();
  let stats = null;

  try {
    stats = await toPromisedStats(container);
  } catch {
    stats = null;
  }

  const memoryUsage = Number(stats?.memory_stats?.usage || 0);
  const memoryLimit = Number(stats?.memory_stats?.limit || 0);
  const memoryPercent = memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;
  const cpuPercent = formatCpuPercent(stats);
  const startedAt = inspect?.State?.StartedAt || null;
  const finishedAt = inspect?.State?.FinishedAt || null;

  return {
    id: inspect?.Id || containerId,
    shortId: (inspect?.Id || containerId).slice(0, 12),
    name: inspect?.Name?.replace(/^\//, "") || containerId.slice(0, 12),
    image: inspect?.Config?.Image || null,
    state: inspect?.State?.Status || inspect?.State?.State || null,
    status: inspect?.State?.Running ? "running" : inspect?.State?.Status || null,
    startedAt,
    finishedAt,
    uptimeSeconds: startedAt ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)) : 0,
    cpu: {
      percent: Number(cpuPercent.toFixed(1))
    },
    memory: {
      usageBytes: memoryUsage,
      usage: formatBytes(memoryUsage),
      limitBytes: memoryLimit,
      limit: formatBytes(memoryLimit),
      percent: Number(memoryPercent.toFixed(1))
    },
    network: stats?.networks || {},
    restartCount: inspect?.RestartCount ?? 0,
    pid: inspect?.State?.Pid ?? null,
    running: Boolean(inspect?.State?.Running)
  };
}

export async function pingDocker() {
  await docker.ping();
}

export function watchDockerContainerEvents(onEvent, onError) {
  docker.getEvents({ filters: { type: ["container"] } }, (error, stream) => {
    if (error) {
      if (onError) {
        onError(error);
      }
      return;
    }

    let buffer = "";

    stream.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        if (onEvent) {
          onEvent(line);
        }
      }
    });

    stream.on("error", (streamError) => {
      if (onError) {
        onError(streamError);
      }
    });

    stream.on("end", () => {
      if (onError) {
        onError(new Error("Docker event stream closed"));
      }
    });
  });
}
