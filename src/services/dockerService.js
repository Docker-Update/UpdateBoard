import Docker from "dockerode";

const socketPath = process.platform === "win32" ? "//./pipe/docker_engine" : "/var/run/docker.sock";
const docker = new Docker({ socketPath });

export async function listRunningContainers() {
  const containers = await docker.listContainers({ all: false });

  return containers.map((item) => ({
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
