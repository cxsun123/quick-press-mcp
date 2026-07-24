import crypto from "crypto";
import TurndownService from "turndown";
import { ZhihuArticle, ZhihuCookieStore } from "./types.js";
import { cookieHeader } from "./cookie.js";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

function extractId(url: string): string | null {
  const match = url.match(/zhuanlan\.zhihu\.com\/p\/(\d+)/);
  return match ? match[1] : null;
}

export function isZhihuUrl(url: string): boolean {
  return /zhuanlan\.zhihu\.com\/p\/\d+/.test(url);
}

async function fetchZseCk(cookieStr: string, url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: { cookie: cookieStr, "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36" },
  });
  const html = await resp.text();
  const match = html.match(/<meta[^>]*id="zh-zse-ck"[^>]*content="([^"]+)"/);
  if (!match) {
    throw new Error(`Failed to extract zse_ck. Status: ${resp.status}, body length: ${html.length}`);
  }
  return match[1];
}

function computeXZse96(zseCk: string, path: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `101_3_3.0${path}_${timestamp}`;
  const hmac = crypto.createHmac("sha256", zseCk).update(message).digest();
  const encoded = Buffer.from(hmac).toString("base64");
  return `2.0_${Buffer.from(encoded, "utf-8").toString("base64")}`;
}

export async function fetchZhihuArticle(
  url: string,
  store: ZhihuCookieStore
): Promise<ZhihuArticle> {
  const articleId = extractId(url);
  if (!articleId) throw new Error(`Invalid zhihu URL: ${url}`);

  const cookieStr = cookieHeader(store);
  const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
  const apiPath = `/api/v4/articles/${articleId}`;

  // Get zse_ck from the article page (it's in the 403 HTML too)
  const zseCk = await fetchZseCk(cookieStr, url);

  // Compute signature
  const xZse96 = computeXZse96(zseCk, apiPath);

  // Call API
  const apiUrl = `https://www.zhihu.com${apiPath}`;
  const resp = await fetch(apiUrl, {
    headers: {
      "accept": "*/*",
      "accept-language": "zh-CN,zh;q=0.9",
      "cookie": cookieStr,
      "referer": url,
      "user-agent": userAgent,
      "x-api-version": "3.0.91",
      "x-app-za": "OS=Web",
      "x-requested-with": "fetch",
      "x-zse-93": "101_3_3.0",
      "x-zse-96": xZse96,
    },
  });

  if (!resp.ok) {
    throw new Error(`Zhihu API returned ${resp.status}: ${await resp.text().catch(() => "")}`);
  }

  const data = (await resp.json()) as any;
  const title: string = data.title || "";
  const htmlContent: string = data.content || "";
  const author: string | null = data.author?.name || null;
  const coverUrl: string | null = data.image_url || null;

  const markdown = turndown.turndown(htmlContent);
  return { title, markdown, coverUrl, author };
}
