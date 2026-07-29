#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, appendFileSync, statSync, openSync, readSync, closeSync, mkdirSync, existsSync } from "fs";
import { extname, resolve, join, dirname } from "path";
import { tmpdir } from "os";

import { isZhihuUrl, fetchZhihuArticle, loadCookies as loadZhihuCookies } from "./zhihu/index.js";

// ---------------------------------------------------------------------------
// File type detection (mirrors server logic)
// ---------------------------------------------------------------------------

type FileType = "MARKDOWN" | "HTML" | "TXT" | "PDF" | "WORD" | "ODT" | "RTF" | "PPT" | "UNKNOWN";

const EXT_TYPE_MAP: Record<string, FileType> = {
  ".md": "MARKDOWN", ".markdown": "MARKDOWN",
  ".html": "HTML", ".htm": "HTML",
  ".txt": "TXT", ".pdf": "PDF",
  ".doc": "WORD", ".docx": "WORD",
  ".odt": "ODT", ".rtf": "RTF",
  ".ppt": "PPT", ".pptx": "PPT",
};

const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
const HTML_EXTENSIONS = new Set([".html", ".htm"]);

const MAGIC_SIGNATURES: { bytes: number[]; type: FileType }[] = [
  { bytes: [0x25, 0x50, 0x44, 0x46], type: "PDF" },
  { bytes: [0xd0, 0xcf, 0x11, 0xe0], type: "WORD" },
  { bytes: [0x50, 0x4b, 0x03, 0x04], type: "WORD" },
  { bytes: [0x7b, 0x5c, 0x72, 0x74, 0x66], type: "RTF" },
  { bytes: [0x3c, 0x68, 0x74, 0x6d, 0x6c], type: "HTML" },
  { bytes: [0x3c, 0x48, 0x54, 0x4d, 0x4c], type: "HTML" },
];

function detectFileType(fileName: string, header: Buffer): FileType {
  const ext = extname(fileName).toLowerCase();
  const extType = EXT_TYPE_MAP[ext] || "UNKNOWN";

  let magicType: FileType = "UNKNOWN";
  for (const sig of MAGIC_SIGNATURES) {
    if (sig.bytes.every((b, i) => header[i] === b)) {
      magicType = sig.type;
      break;
    }
  }

  // ODT detection: ZIP header + "opendocument" magic
  if (magicType === "WORD" && header[0] === 0x50 && extType === "ODT") {
    return "ODT";
  }

  if (magicType !== "UNKNOWN" && magicType !== extType && extType !== "UNKNOWN") {
    return magicType; // magic bytes override extension
  }
  if (magicType !== "UNKNOWN" && extType === "UNKNOWN") {
    return magicType;
  }
  return extType;
}

function getMaxFileSize(type: FileType): number {
  if (type === "MARKDOWN" || type === "TXT") return 500 * 1024;   // 500KB
  if (type === "HTML") return 2 * 1024 * 1024;                    // 2MB
  return 3 * 1024 * 1024; // 3MB (binary / unknown)
}

// ---------------------------------------------------------------------------
// Debug logging
// ---------------------------------------------------------------------------

const LOG_FILE = join(tmpdir(), "quick-press-mcp.log");

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    const dir = dirname(LOG_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(LOG_FILE, line);
  } catch {}
  console.error(line.trim());
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const REMOTE_URL = process.env.QUICK_PRESS_MCP_URL;
const API_KEY = process.env.QUICK_PRESS_MCP_API_KEY;

if (!REMOTE_URL || !API_KEY) {
  log(
    "Missing env: QUICK_PRESS_MCP_URL and QUICK_PRESS_MCP_API_KEY are required"
  );
  process.exit(1);
}
log(`Config: URL=${REMOTE_URL}, KEY=${API_KEY.slice(0, 8)}...`);

// ---------------------------------------------------------------------------
// Remote JSON-RPC proxy
// ---------------------------------------------------------------------------

let remoteRequestId = 0;

async function remoteCall(
  method: string,
  params?: Record<string, unknown>
): Promise<unknown> {
  const id = ++remoteRequestId;
  const resp = await fetch(REMOTE_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Remote ${method} failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  const json = (await resp.json()) as {
    result?: unknown;
    error?: { code: number; message: string };
  };
  if (json.error) throw new Error(`Remote error ${json.error.code}: ${json.error.message}`);
  return json.result;
}

// ---------------------------------------------------------------------------
// File-reading helper
// ---------------------------------------------------------------------------

function readLocalFile(filePath: string): { fileContent: string; fileName: string } {
  const resolved = resolve(filePath);
  const stat = statSync(resolved);
  const header = Buffer.alloc(8);
  const fd = openSync(resolved, "r");
  readSync(fd, header, 0, 8, 0);
  closeSync(fd);

  const fileType = detectFileType(resolved, header);
  const maxSize = getMaxFileSize(fileType);
  if (stat.size > maxSize) {
    const mb = (stat.size / 1024 / 1024).toFixed(1);
    const limit = maxSize >= 1024 * 1024 ? `${maxSize / 1024 / 1024}MB` : `${maxSize / 1024}KB`;
    throw new Error(`File too large (${mb}MB). ${fileType} max: ${limit}.`);
  }
  const buffer = readFileSync(resolved);
  const fileContent = buffer.toString("base64");
  const fileName = resolved.split("/").pop() || "unknown";
  return { fileContent, fileName };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

// JSON Schema definitions (avoid zod-to-json-schema compatibility issues with Zod 4)
const S: Record<string, any> = {
  list_posts: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["draft", "published", "scheduled"], description: "Filter by status" },
      visibility: { type: "string", enum: ["public", "private", "password"], description: "Filter by visibility" },
      limit: { type: "number", description: "Max results (default 50)" },
      offset: { type: "number", description: "Offset for pagination" },
    },
  },
  get_post: {
    type: "object",
    properties: { postId: { type: "string", description: "Post ID" } },
    required: ["postId"],
  },
  delete_post: {
    type: "object",
    properties: { postId: { type: "string", description: "Post ID to delete" } },
    required: ["postId"],
  },
  search_posts: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search keyword" },
      limit: { type: "number", description: "Max results (default 20)" },
    },
    required: ["query"],
  },
  get_stats: { type: "object", properties: {} },
  upload_media: {
    type: "object",
    properties: {
      url: { type: "string", description: "Image URL to download and upload" },
      base64: { type: "string", description: "Base64 encoded image data" },
      filename: { type: "string", description: "Filename" },
      maxWidth: { type: "number", description: "Max width in pixels (default: 800)" },
      quality: { type: "number", description: "JPEG quality 1-100 (default: 80)" },
    },
  },
  publish: {
    type: "object",
    properties: {
      source_type: { type: "string", enum: ["URL", "FILE"], description: "Source type: URL for web articles, FILE for local documents" },
      url: { type: "string", description: "Source URL (required if source_type=URL)" },
      filePath: { type: "string", description: "Local file path (required if source_type=FILE)" },
      text: { type: "string", description: "Raw text content (alternative to url)" },
      visibility: { type: "string", enum: ["public", "private", "password"], description: "Post visibility (default: public)" },
      imageUrl: { type: "string", description: "Direct image URL to use as cover" },
      imageQuery: { type: "string", description: "Keywords to search for cover image" },
      imageCount: { type: "number", description: "Number of images to search (1-3, default 1)" },
      skipRewrite: { type: "boolean", description: "Skip AI rewrite" },
      language: { type: "string", description: "Output language for the published article" },
    },
  },
};

interface ToolDef {
  name: string;
  description: string;
}

const TOOLS: ToolDef[] = [
  {
    name: "publish",
    description:
      "Publish an article from a URL or a local file.\n" +
      "Parameters:\n" +
      "  url (string) — article URL to fetch and rewrite\n" +
      "  text (string) — raw text content (alternative to url)\n" +
      "  filePath (string) — local file path (PDF/DOCX/MD etc.)\n" +
      "  source_type (enum: URL|FILE) — auto-detected: filePath → FILE, otherwise URL\n" +
      "  visibility (enum: public|private|password) — default public\n" +
      "  imageUrl (string) — direct cover image URL\n" +
      "  imageQuery (string) — keywords to search for cover image\n" +
      "  imageCount (number) — images to search (1-3, default 1)\n" +
      "  skipRewrite (boolean) — skip AI rewrite\n" +
      "  language (string) — output language (e.g. 中文, English, 日本語)\n" +
      "Built-in file parsing and URL fetching — just provide filePath or url, no manual extraction needed. " +
      "工具内置文件解析和 URL 抓取能力，只需提供文件路径或 URL 即可，无需手动提取文本或下载。" +
      "Supports zhuanlan.zhihu.com anti-scraping bypass (via ZHIHU_COOKIES env).\n" +
      "Do NOT use pdftotext/python3 — this tool handles everything internally.\n" +
      "\n" +
      "Returns JSON:\n" +
      "  postId (string) — UUID of the created post\n" +
      "  slug (string) — URL slug\n" +
      "  url (string) — full frontend URL (public) or relative path (private)\n" +
      "  title / summary / keywords / categories / tags — content metadata\n" +
      "  coverImage (string or null) — uploaded cover image URL\n" +
      "  imagesUploaded (number) — count of images embedded\n" +
      "  password_plaintext (string) — only returned when visibility=password",
  },
  { name: "list_posts", description: "List all posts. Params: status (draft|published|scheduled), visibility, limit (default 50), offset" },
  { name: "get_post", description: "Get full post details. Params: postId (required)" },
  { name: "delete_post", description: "Delete a post permanently. Params: postId (required)" },
  { name: "search_posts", description: "Search posts by keyword. Params: query (required), limit (default 20)" },
  { name: "get_stats", description: "Get blog statistics. No params needed." },
  { name: "upload_media", description: "Upload image/media. Params: url (download from URL) or base64+filename, maxWidth (default 800), quality (1-100, default 80)" },
];

// ---------------------------------------------------------------------------
// Build server
// ---------------------------------------------------------------------------

const toolMap = new Map(TOOLS.map((t) => [t.name, t]));

const server = new Server(
  { name: "quick-press-mcp", version: "0.1.0" },
  {
    capabilities: { tools: {}, resources: {} },
    instructions:
      "Current tools (this list may change — call tools/list or check here, don't assume names from memory):\n" +
      TOOLS.map((t) => `- ${t.name}`).join("\n") +
      "\n\nUse `publish` for anything that should end up as a post (URL, raw text, or a local file — it handles parsing/rewriting internally). " +
      "There is no separate draft/manual-content tool; do not fall back to manual file parsing.",
  }
);
log(`Server created: name=quick-press-mcp, version=0.1.0, capabilities=${JSON.stringify({ tools: {}, resources: {} })}`);

const RESOURCES = [
  {
    uri: "quick-press://info",
    name: "Quick Press Info",
    description: "Server info and available tools / 服务器信息与可用工具列表",
    mimeType: "text/plain",
  },
  {
    uri: "quick-press://stats",
    name: "Quick Press Stats",
    description: "Blog statistics / 博客统计信息",
    mimeType: "text/plain",
  },
];

const RESOURCE_TEMPLATES = [
  {
    uriTemplate: "quick-press://posts/{postId}",
    name: "Post by ID",
    description: "Get post details by ID / 根据 ID 获取文章详情",
    mimeType: "text/plain",
  },
];

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  log("handling resources/list");
  return { resources: RESOURCES };
});

server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
  log("handling resources/templates/list");
  return { resourceTemplates: RESOURCE_TEMPLATES };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  log(`handling resources/read: ${uri}`);
  let text = "";
  if (uri === "quick-press://info") {
    text = `Quick Press MCP Server v0.1.0\nRemote: ${REMOTE_URL}\n\nAvailable tools:\n` +
      TOOLS.map((t) => `  - ${t.name}: ${t.description.split("\n")[0]}`).join("\n");
  } else if (uri === "quick-press://stats") {
    const result = await remoteCall("tools/call", { name: "get_stats", arguments: {} });
    text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  } else {
    const postMatch = uri.match(/^quick-press:\/\/posts\/(.+)$/);
    if (postMatch) {
      const postId = postMatch[1];
      const result = await remoteCall("tools/call", { name: "get_post", arguments: { postId } });
      text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    } else {
      throw new Error(`Unknown resource: ${uri}`);
    }
  }
  return {
    contents: [{ uri, mimeType: "text/plain", text }],
  };
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  log("handling tools/list");
  return {
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: S[t.name] || { type: "object", properties: {} },
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  log(`tool call: ${name}, args: ${JSON.stringify(args).slice(0, 200)}`);
  const def = toolMap.get(name);
  if (!def) {
    log(`Unknown tool: ${name}`);
    throw new Error(`Unknown tool: ${name}`);
  }

  try {
    let remoteName = name;
    let remoteArgs = { ...(args || {}) };

    if (name === "publish") {
      const sourceType = (
        remoteArgs.source_type as string ||
        (remoteArgs.filePath ? "FILE" : "URL")
      ).toUpperCase();

      if (sourceType === "FILE") {
        const filePath = remoteArgs.filePath as string;
        if (!filePath) throw new Error("filePath is required for source_type=FILE");
        const { fileContent, fileName } = readLocalFile(filePath);
        remoteName = "publish_from_file";
        remoteArgs = {
          fileContent, fileName,
          visibility: remoteArgs.visibility,
          imageUrl: remoteArgs.imageUrl,
          imageQuery: remoteArgs.imageQuery,
          imageCount: remoteArgs.imageCount,
          skipRewrite: remoteArgs.skipRewrite,
          language: remoteArgs.language,
        };
      } else {
        const url = remoteArgs.url as string | undefined;
        if (url && isZhihuUrl(url)) {
          log("detected zhihu URL, fetching via zhihu API");
          const zhihuCookies = loadZhihuCookies();
          if (!zhihuCookies) {
            throw new Error(
              "Zhihu cookies not found. Please set ZHIHU_COOKIES env var or save cookies to ~/.quick-press-mcp/zhihu-cookies.json"
            );
          }
          const article = await fetchZhihuArticle(url, zhihuCookies);
          remoteName = "publish_full";
          remoteArgs = {
            title: article.title,
            text: article.markdown,
            visibility: remoteArgs.visibility,
            imageUrl: remoteArgs.imageUrl || article.coverUrl,
            imageQuery: remoteArgs.imageQuery,
            imageCount: remoteArgs.imageCount,
            language: remoteArgs.language,
          };
        } else {
          remoteName = "publish_full";
          remoteArgs = {
            url: remoteArgs.url,
            text: remoteArgs.text,
            visibility: remoteArgs.visibility,
            imageUrl: remoteArgs.imageUrl,
            imageQuery: remoteArgs.imageQuery,
            imageCount: remoteArgs.imageCount,
            skipRewrite: remoteArgs.skipRewrite,
            language: remoteArgs.language,
          };
        }
      }
      // Drop undefined values
      Object.keys(remoteArgs).forEach((k) => remoteArgs[k] === undefined && delete remoteArgs[k]);
    }

    log(`calling remote: ${remoteName}`);
    const result = await remoteCall("tools/call", { name: remoteName, arguments: remoteArgs });
    log(`remote result: ${JSON.stringify(result).slice(0, 200)}`);
    const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    return { content: [{ type: "text" as const, text }] };
  } catch (e: any) {
    return {
      content: [{ type: "text" as const, text: `Error: ${e.message}` }],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  log("starting MCP server...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("server connected to stdio transport, waiting for messages...");

  // Keep process alive
  process.stdin.resume();
  process.stdin.on("end", () => {
    log("stdin ended, exiting");
    process.exit(0);
  });
  process.on("SIGTERM", () => { log("SIGTERM received"); process.exit(0); });
  process.on("SIGINT", () => { log("SIGINT received"); process.exit(0); });
  process.on("exit", (code) => { log(`process exiting with code ${code}`); });
  process.on("uncaughtException", (e) => { log(`uncaughtException: ${e.message}\n${e.stack}`); });
  process.on("unhandledRejection", (e) => { log(`unhandledRejection: ${e}`); });
}

main().catch((e) => {
  log(`Fatal: ${e.message}\n${e.stack}`);
  process.exit(1);
});
