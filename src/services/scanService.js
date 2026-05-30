import semver from "semver";
import { listRunningContainers } from "./dockerService.js";
import { fetchTags, resolveLatestVersionTag } from "./registryService.js";
import { parseImageReference, toDisplayImageName } from "../utils/image.js";

function compareVersions(currentTag, latestInfo) {
  const currentNormalized = semver.valid(currentTag.startsWith("v") ? currentTag.slice(1) : currentTag);

  if (latestInfo.strategy === "semver" && latestInfo.latestNormalized && currentNormalized) {
    return {
      needsUpdate: semver.lt(currentNormalized, latestInfo.latestNormalized),
      currentVersion: currentTag,
      latestVersion: latestInfo.latestTag,
      compareStrategy: "semver"
    };
  }

  if (latestInfo.strategy === "latest-tag") {
    return {
      needsUpdate: currentTag !== "latest",
      currentVersion: currentTag,
      latestVersion: "latest",
      compareStrategy: "latest-tag"
    };
  }

  return {
    needsUpdate: false,
    currentVersion: currentTag,
    latestVersion: null,
    compareStrategy: "unknown"
  };
}

export async function runScan() {
  const dockerContainers = await listRunningContainers();
  const errors = [];

  const containers = await Promise.all(
    dockerContainers.map(async (container) => {
      try {
        const ref = parseImageReference(container.image);
        const tags = await fetchTags(ref.registry, ref.repository);
        const latestInfo = resolveLatestVersionTag(tags);
        const versionResult = compareVersions(ref.tag, latestInfo);

        return {
          id: container.id,
          shortId: container.shortId,
          name: container.name,
          image: toDisplayImageName(ref),
          registry: ref.registry,
          repository: ref.repository,
          status: container.status,
          state: container.state,
          currentVersion: versionResult.currentVersion,
          latestVersion: versionResult.latestVersion,
          needsUpdate: versionResult.needsUpdate,
          compareStrategy: versionResult.compareStrategy,
          tagsScanned: tags.length
        };
      } catch (error) {
        errors.push({ container: container.name, error: error.message });

        return {
          id: container.id,
          shortId: container.shortId,
          name: container.name,
          image: container.image,
          status: container.status,
          state: container.state,
          currentVersion: "inconnue",
          latestVersion: "inconnue",
          needsUpdate: false,
          compareStrategy: "error",
          tagsScanned: 0,
          error: error.message
        };
      }
    })
  );

  return {
    scannedAt: new Date().toISOString(),
    totalContainers: containers.length,
    updatesCount: containers.filter((item) => item.needsUpdate).length,
    containers,
    errors
  };
}
