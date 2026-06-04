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
