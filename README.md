<a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>

# quick-press-mcp

[![npm version](https://img.shields.io/npm/v/quick-press-mcp)](https://www.npmjs.com/package/quick-press-mcp)

Local MCP Client for [quick-press](https://github.com/anomalyco/quick-press) blog CMS.

Runs on your machine via stdio, reads local files, and forwards requests to the remote quick-press MCP Server. This bridges the gap between AI agents and the remote server — agents can now publish local PDF/DOCX/MD files directly.

## How it works

```
AI Agent (stdio) → quick-press-mcp (local) → Remote MCP Server (HTTP) → Supabase
                    reads local files
                    base64-encodes
                    forwards via JSON-RPC
```

- Tools defined locally (zero network dependency at startup)
- Single `publish` tool with `source_type` auto-detection: URL → fetch & rewrite, filePath → read & parse
- Remote server needs zero changes

## Install

```bash
npm install -g quick-press-mcp
```

Or use directly via `npx` (no install needed):

```bash
npx quick-press-mcp@latest
```

## Configure

### OpenCode

Add to `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "quick-press-mcp": {
      "enabled": true,
      "type": "local",
      "command": ["npx", "quick-press-mcp@latest"],
      "environment": {
        "QUICK_PRESS_MCP_URL": "https://your-project.vercel.app/api/mcp",
        "QUICK_PRESS_MCP_API_KEY": "sk-your-key-here"
      }
    }
  }
}
```

**Note**: OpenCode uses `"environment"` (not `"env"`).

### Claude CLI

Add to `~/.claude.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "quick-press-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["quick-press-mcp@latest"],
      "env": {
        "QUICK_PRESS_MCP_URL": "https://your-project.vercel.app/api/mcp",
        "QUICK_PRESS_MCP_API_KEY": "sk-your-key-here"
      }
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "quick-press-mcp": {
      "command": "npx",
      "args": ["quick-press-mcp@latest"],
      "env": {
        "QUICK_PRESS_MCP_URL": "https://your-project.vercel.app/api/mcp",
        "QUICK_PRESS_MCP_API_KEY": "sk-your-key-here"
      }
    }
  }
}
```

### Cursor / Windsurf / Continue

Add to `.cursor/mcp.json` (or equivalent config) in your project:

```json
{
  "mcpServers": {
    "quick-press-mcp": {
      "command": "npx",
      "args": ["quick-press-mcp@latest"],
      "env": {
        "QUICK_PRESS_MCP_URL": "https://your-project.vercel.app/api/mcp",
        "QUICK_PRESS_MCP_API_KEY": "sk-your-key-here"
      }
    }
  }
}
```

### OpenAI Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.quick-press-mcp]
command = "npx"
args = ["-y", "quick-press-mcp@latest"]
env = { QUICK_PRESS_MCP_URL = "https://your-project.vercel.app/api/mcp", QUICK_PRESS_MCP_API_KEY = "sk-your-key-here" }
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `QUICK_PRESS_MCP_URL` | Yes | Remote MCP Server endpoint, e.g. `https://xxx.vercel.app/api/mcp` |
| `QUICK_PRESS_MCP_API_KEY` | Yes | API key (e.g. `sk-xxx`) for authorization |
| `ZHIHU_COOKIES` | No | Zhihu cookies (JSON) for anti-scraping bypass when publishing from zhuanlan.zhihu.com |

### Zhihu Anti-Scraping Support

Zhihu blocks programmatic access. To publish articles from `zhuanlan.zhihu.com/p/xxx`, you need to provide valid cookies:

1. Log into [zhihu.com](https://www.zhihu.com) in your browser
2. Open DevTools → Application → Cookies → `zhihu.com`
3. Export cookies as a JSON object with `cookies` array and `d_c0` value
4. Store them:

**Via environment variable:**
```bash
export ZHIHU_COOKIES='{"cookies":[{"name":"d_c0","value":"xxx","domain":".zhihu.com"},...],"d_c0":"xxx","savedAt":1700000000000}'
```

**Via file** (stored at `~/.quick-press-mcp/zhihu-cookies.json`):
```json
{
  "cookies": [
    {"name": "d_c0", "value": "xxx", "domain": ".zhihu.com"},
    {"name": "zse_ck", "value": "xxx", "domain": ".zhihu.com"}
  ],
  "d_c0": "xxx",
  "savedAt": 1700000000000
}
```

## Supported file types

| Extension | AI Rewrite | Description |
|-----------|------------|-------------|
| `.md` `.markdown` | No (skip) | Markdown — publish as-is with metadata extraction |
| `.html` `.htm` | No (skip) | HTML — convert to Markdown, extract metadata |
| `.txt` | No (skip) | Plain text — add Markdown formatting, extract metadata |
| `.pdf` | Yes | PDF — full AI rewrite |
| `.doc` `.docx` | Yes | Word — full AI rewrite |
| `.odt` | Yes | OpenDocument — full AI rewrite |
| `.rtf` | Yes | Rich Text — full AI rewrite |
| `.ppt` `.pptx` | Yes | PowerPoint — full AI rewrite |

## AGENTS.md — Auto-trigger Rules

To make your AI agent automatically call the `publish` tool, add the following to your project's `AGENTS.md`:

```markdown
## MCP Auto-trigger Rules

When user prompt matches the following patterns, **directly call** the `publish` tool, **do not ask for confirmation**:

### Local File Publishing

| User prompt | Arguments |
|---|---|
| `publish this file: {PATH}` | `{ "filePath": "<PATH>" }` |
| `create an article from this PDF/DOCX: {PATH}` | `{ "filePath": "<PATH>" }` |
| `publish this document: {PATH}` | `{ "filePath": "<PATH>" }` |
| `create post from file: {PATH}` | `{ "filePath": "<PATH>" }` |

`source_type` auto-detected: `filePath` → FILE, otherwise URL.

### URL Publishing

| User prompt | Arguments |
|---|---|
| `create an article: {URL}` | `{ "url": "<URL>" }` |
| `publish this: {URL}` | `{ "url": "<URL>" }` |
| `republish: {URL}` | `{ "url": "<URL>" }` |
| `translate this into Chinese: {URL}` | `{ "url": "<URL>", "language": "Chinese" }` |
| `rewrite and publish: {URL}` | `{ "url": "<URL>" }` |

**Important**: Tool has built-in file parsing and URL fetching — just provide `url` or `filePath`. Do NOT use pdftotext, python3, or similar command-line tools.
```

## Usage

Once configured, use natural language in your AI agent:

```
# Publish from URL
Publish this article: https://example.com/article

# Publish from local file
Publish this file: /path/to/article.pdf
Create an article from: ./my-paper.pdf
```

The AI agent will:
1. Match your prompt to the auto-trigger rules in AGENTS.md
2. Call `publish` with `url` or `filePath`
3. `source_type` auto-detected: filePath → FILE, otherwise URL
4. For FILE mode: reads local file, base64-encodes, forwards to remote
5. Remote server parses, AI-rewrites (if applicable), and publishes

## Available tools

| Tool | Description |
|------|-------------|
| `publish` | Publish from URL or local file (single entry point) |
| `list_posts` | List all posts |
| `get_post` | Get full post details by ID |
| `delete_post` | Delete a post permanently |
| `search_posts` | Search posts by keyword |
| `upload_media` | Upload image/media |
| `get_stats` | Get blog statistics |

## Development

```bash
git clone https://github.com/anomalyco/quick-press-mcp.git
cd quick-press-mcp
npm install
npm run build
npm link  # make `quick-press-mcp` available globally
```

### Publishing

```bash
# Auth token in .npmrc (registry.npmjs.org)
# If global registry is set to a mirror (e.g. npmmirror.com), override it:
npm version <new-version>
npm publish --registry=https://registry.npmjs.org
```

## License

MIT
