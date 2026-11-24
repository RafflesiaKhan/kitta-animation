import { promisify } from 'node:util';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { readSettings, writeSettings } from './settings';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'kitta_admin_session';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const WRONG_PASSWORD_DELAY_MS = 100;
const sessions = new Map<string, number>();
let resetConsumed = false;

function cookieValue(req: Request): string | undefined {
  const header = req.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) {
      try { return decodeURIComponent(value.join('=')); } catch { return undefined; }
    }
  }
  return undefined;
}

function expireSessions(): void {
  const now = Date.now();
  for (const [token, expiresAt] of sessions) if (expiresAt <= now) sessions.delete(token);
}

async function consumeAdminReset(): Promise<void> {
  if (resetConsumed || process.env.KITTA_ADMIN_RESET !== '1') return;
  resetConsumed = true;
  const current = await readSettings();
  if (current.adminResetConsumed) return;
  if (!current.adminPassword) {
    await writeSettings({ ...current, adminResetConsumed: true });
    return;
  }
  const { adminPassword: _removed, ...withoutPassword } = current;
  await writeSettings({ ...withoutPassword, adminResetConsumed: true });
}

export async function hasAdminPassword(): Promise<boolean> {
  await consumeAdminReset();
  return Boolean((await readSettings()).adminPassword);
}

export async function createAdminPassword(password: string): Promise<void> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64) as Buffer;
  const current = await readSettings();
  await writeSettings({ ...current, adminPassword: { salt: salt.toString('base64'), hash: hash.toString('base64') } });
}

let setupLock: Promise<void> = Promise.resolve();

/** Creates the first password atomically with respect to concurrent requests in this process. */
export async function createAdminPasswordIfAbsent(password: string): Promise<boolean> {
  const operation = setupLock.then(async () => {
    if (await hasAdminPassword()) return false;
    await createAdminPassword(password);
    return true;
  });
  setupLock = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  await consumeAdminReset();
  const record = (await readSettings()).adminPassword;
  if (!record) return false;
  try {
    const expected = Buffer.from(record.hash, 'base64');
    const actual = await scrypt(password, Buffer.from(record.salt, 'base64'), expected.length) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function createSession(): string {
  expireSessions();
  const token = randomBytes(32).toString('base64url');
  sessions.set(token, Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  return token;
}

export function readSession(req: Request): boolean {
  expireSessions();
  const token = cookieValue(req);
  return Boolean(token && sessions.get(token) && sessions.get(token)! > Date.now());
}

export function setSessionCookie(res: Response, token: string): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${SESSION_MAX_AGE_SECONDS}; Path=/; HttpOnly; SameSite=Strict`);
}

export function clearSession(res: Response, req?: Request): void {
  const token = req && cookieValue(req);
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict`);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (readSession(req)) return next();
  res.status(401).json({ error: 'Authentication required.' });
}

/** Reject cross-origin state changes while allowing the local Vite/API pair. */
export function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    const url = new URL(origin);
    const local = (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') && (url.port === '' || url.port === '5173' || url.port === '5175');
    if (local) return next();
  } catch { /* invalid origins are rejected below */ }
  res.status(403).json({ error: 'Invalid request origin.' });
}

export async function verifyWithDelay(password: string): Promise<boolean> {
  const valid = await verifyAdminPassword(password);
  if (!valid) await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
  return valid;
}

export function resetAuthStateForTests(): void {
  sessions.clear();
  resetConsumed = false;
}

export const authCookieName = SESSION_COOKIE;
