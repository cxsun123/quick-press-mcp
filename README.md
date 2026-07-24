# quick-press-mcp

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
npx quick-press-mcp
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
      "command": ["npx", "quick-press-mcp"],
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
      "args": ["quick-press-mcp"],
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
      "args": ["quick-press-mcp"],
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
      "args": ["quick-press-mcp"],
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
args = ["-y", "quick-press-mcp"]
env = { QUICK_PRESS_MCP_URL = "https://your-project.vercel.app/api/mcp", QUICK_PRESS_MCP_API_KEY = "sk-your-key-here" }
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `QUICK_PRESS_MCP_URL` | Yes | Remote MCP Server endpoint, e.g. `https://xxx.vercel.app/api/mcp` |
| `QUICK_PRESS_MCP_API_KEY` | Yes | API key (e.g. `sk-xxx`) for authorization |

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
## MCP 自动调用规则

当用户 prompt 匹配以下模式时，**直接调用** quick-press-mcp 的 `publish` 工具，**不要询问确认**：

### 本地文件发布

| 用户 prompt 模式 | 参数 |
|---|---|
| `发布本地文件: {PATH}` | `{ "filePath": "<PATH>" }` |
| `用这个PDF/DOCX生成文章: {PATH}` | `{ "filePath": "<PATH>" }` |
| `把这篇文档发布为博客: {PATH}` | `{ "filePath": "<PATH>" }` |
| `创建文章: {PATH}` (PATH 是本地文件) | `{ "filePath": "<PATH>" }` |

`source_type` 自动判断：有 `filePath` 则为 FILE，否则为 URL。

### URL 发布

| 用户 prompt 模式 | 参数 |
|---|---|
| `创建文章: {URL}` | `{ "url": "<URL>" }` |
| `发布文章: {URL}` | `{ "url": "<URL>" }` |
| `转载: {URL}` | `{ "url": "<URL>" }` |
| `用这篇生成中文文章: {URL}` | `{ "url": "<URL>", "language": "中文" }` |
| `把英文博客翻译成中文发布: {URL}` | `{ "url": "<URL>", "language": "中文" }` |

**重要**：工具内置文件解析和 URL 抓取能力，只需提供 URL 或文件路径即可。不要尝试 pdftotext、python3 等命令行工具。
```

## Usage

Once configured, use natural language in your AI agent:

```
# Publish from URL
创建文章: https://example.com/article

# Publish from local file
发布本地文件: /path/to/article.pdf
用这个PDF生成文章: ./my-paper.pdf
把这篇文档发布为博客: ~/Documents/report.docx
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
| `create_draft` | Create a new draft post |
| `publish_post` | Publish or update a post with full content |
| `list_posts` | List all posts |
| `get_post` | Get full post details by ID |
| `delete_post` | Delete a post permanently |
| `search_posts` | Search posts by keyword |
| `upload_media` | Upload image/media |
| `extract_summary` | Extract summary and keywords using AI |
| `get_stats` | Get blog statistics |

## Development

```bash
git clone https://github.com/anomalyco/quick-press-mcp.git
cd quick-press-mcp
npm install
npm run build
npm link  # make `quick-press-mcp` available globally
```

## License

MIT
