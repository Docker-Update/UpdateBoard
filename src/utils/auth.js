import crypto from "node:crypto";

const cookieName = "updateboard_session";
const sessions = new Map();

function parseCookies(header = "") {
  const output = {};

  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) {
      continue;
    }

    output[rawKey] = decodeURIComponent(rawValue.join("=") || "");
  }

  return output;
}

function getCredentialPair() {
  return {
    username: process.env.ADMIN_USERNAME || "admin",
    password: process.env.ADMIN_PASSWORD || "change-me"
  };
}

function issueToken(username) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, {
    username,
    createdAt: Date.now()
  });
  return token;
}

export function getSessionCookieName() {
  return cookieName;
}

export function authenticateLogin(username, password) {
  const expected = getCredentialPair();
  return username === expected.username && password === expected.password;
}

export function createSession(username) {
  return issueToken(username);
}

export function destroySessionFromRequest(req) {
  const token = parseCookies(req.headers.cookie || "")[cookieName];
  if (!token) {
    return;
  }

  sessions.delete(token);
}

export function getUsernameFromRequest(req) {
  const token = parseCookies(req.headers.cookie || "")[cookieName];
  if (!token) {
    return null;
  }

  return sessions.get(token)?.username || null;
}

export function requireAuth(req, res, next) {
  const username = getUsernameFromRequest(req);

  if (!username) {
    res.status(401).json({ ok: false, error: "Authentication required" });
    return;
  }

  req.authUser = username;
  next();
}
