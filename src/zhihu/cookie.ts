import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { ZhihuCookieStore } from "./types.js";

const COOKIE_DIR = join(homedir(), ".quick-press-mcp");
const COOKIE_FILE = join(COOKIE_DIR, "zhihu-cookies.json");

function loadFromFile(): ZhihuCookieStore | null {
  try {
    if (!existsSync(COOKIE_FILE)) return null;
    const raw = readFileSync(COOKIE_FILE, "utf-8");
    const store = JSON.parse(raw) as ZhihuCookieStore;
    if (!store.cookies || !store.d_c0 || !store.savedAt) return null;
    const age = Date.now() - store.savedAt;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    if (age > 30 * ONE_DAY) return null;
    return store;
  } catch {
    return null;
  }
}

function loadFromEnv(): ZhihuCookieStore | null {
  try {
    const raw = process.env.ZHIHU_COOKIES;
    if (!raw) return null;
    const store = JSON.parse(raw) as ZhihuCookieStore;
    if (!store.cookies || !store.d_c0) return null;
    return store;
  } catch {
    return null;
  }
}

export function loadCookies(): ZhihuCookieStore | null {
  return loadFromEnv() || loadFromFile();
}

export function cookieHeader(store: ZhihuCookieStore): string {
  return store.cookies.map((c: { name: string; value: string }) => `${c.name}=${c.value}`).join("; ");
}
