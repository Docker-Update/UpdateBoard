export async function safeJsonFetch(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} on ${url}: ${text.slice(0, 200)}`);
  }

  return response.json();
}

export function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Request timeout")), timeoutMs))
  ]);
}
