export function parseImageReference(image) {
  const digestSeparator = image.indexOf("@");
  const cleanImage = digestSeparator >= 0 ? image.slice(0, digestSeparator) : image;

  const lastSlash = cleanImage.lastIndexOf("/");
  const lastColon = cleanImage.lastIndexOf(":");
  const hasTag = lastColon > lastSlash;

  const fullName = hasTag ? cleanImage.slice(0, lastColon) : cleanImage;
  const tag = hasTag ? cleanImage.slice(lastColon + 1) : "latest";

  const firstPart = fullName.split("/")[0] || "";
  const hasRegistry = firstPart.includes(".") || firstPart.includes(":") || firstPart === "localhost";

  let registry = "docker.io";
  let repository = fullName;

  if (hasRegistry) {
    registry = firstPart;
    repository = fullName.split("/").slice(1).join("/");
  }

  if (!repository.includes("/") && registry === "docker.io") {
    repository = `library/${repository}`;
  }

  return {
    original: image,
    registry,
    repository,
    tag,
    canonical: `${registry}/${repository}:${tag}`
  };
}

export function toDisplayImageName(ref) {
  const repo = ref.registry === "docker.io" ? ref.repository.replace(/^library\//, "") : `${ref.registry}/${ref.repository}`;
  return `${repo}:${ref.tag}`;
}
