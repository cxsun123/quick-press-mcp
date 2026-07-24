# quick-press-mcp

quick-press 博客 CMS 的本地 MCP Client。

通过 stdio 运行在本地，读取本地文件，转发请求到远程 quick-press MCP Server。让 AI Agent 可以直接发布本地 PDF/DOCX/MD 文件或从 URL 抓取文章。

## 工作原理

```
AI Agent (stdio) → quick-press-mcp (本地) → 远程 MCP Server (HTTP) → Supabase
                    读取本地文件
                    base64 编码
                    JSON-RPC 转发
```

- 工具在本地定义（启动零网络依赖）
- 单一 `publish` 工具，自动判断源类型：URL → 抓取重写，filePath → 读取解析
- 远程服务器无需任何改动

## 安装

```bash
npm install -g quick-press-mcp
```

或直接通过 `npx` 使用（无需安装）：

```bash
npx quick-press-mcp
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `QUICK_PRESS_MCP_URL` | 是 | 远程 MCP Server 地址，如 `https://xxx.vercel.app/api/mcp` |
| `QUICK_PRESS_MCP_API_KEY` | 是 | API key（如 `sk-xxx`）用于鉴权 |

## 配置

### OpenCode

添加到 `~/.config/opencode/opencode.json`：

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

**注意**：OpenCode 使用 `"environment"`（不是 `"env"`）。

### Claude CLI

添加到 `~/.claude.json` 的 `mcpServers` 中：

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

添加到 `~/Library/Application Support/Claude/claude_desktop_config.json`：

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

添加到项目中的 `.cursor/mcp.json`（或对应配置文件）：

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

添加到 `~/.codex/config.toml`：

```toml
[mcp_servers.quick-press-mcp]
command = "npx"
args = ["-y", "quick-press-mcp"]
env = { QUICK_PRESS_MCP_URL = "https://your-project.vercel.app/api/mcp", QUICK_PRESS_MCP_API_KEY = "sk-your-key-here" }
```

## 支持的文件类型

| 扩展名 | AI 重写 | 说明 |
|--------|---------|------|
| `.md` `.markdown` | 否（跳过） | Markdown — 直接发布，提取元数据 |
| `.html` `.htm` | 否（跳过） | HTML — 转换为 Markdown，提取元数据 |
| `.txt` | 否（跳过） | 纯文本 — 添加 Markdown 格式，提取元数据 |
| `.pdf` | 是 | PDF — AI 全文重写 |
| `.doc` `.docx` | 是 | Word — AI 全文重写 |
| `.odt` | 是 | OpenDocument — AI 全文重写 |
| `.rtf` | 是 | Rich Text — AI 全文重写 |
| `.ppt` `.pptx` | 是 | PowerPoint — AI 全文重写 |

## AGENTS.md — 自动触发规则

在项目的 `AGENTS.md` 中添加以下内容，让 AI Agent 自动调用 `publish` 工具：

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

## 使用

配置完成后，在 AI Agent 中使用自然语言：

```
# 从 URL 发布
创建文章: https://example.com/article

# 从本地文件发布
发布本地文件: /path/to/article.pdf
用这个PDF生成文章: ./my-paper.pdf
把这篇文档发布为博客: ~/Documents/report.docx
```

AI Agent 会：
1. 根据 AGENTS.md 中的规则匹配你的 prompt
2. 调用 `publish` 工具，传入 `url` 或 `filePath`
3. `source_type` 自动判断：有 filePath 则为 FILE，否则为 URL
4. FILE 模式：读取文件、base64 编码、转发到远程
5. 远程服务器解析、AI 重写（如需要）、发布

## 可用工具

| 工具 | 说明 |
|------|------|
| `publish` | 从 URL 或本地文件发布（单一入口） |
| `create_draft` | 创建草稿 |
| `publish_post` | 发布或更新文章 |
| `list_posts` | 列出所有文章 |
| `get_post` | 根据 ID 获取文章详情 |
| `delete_post` | 永久删除文章 |
| `search_posts` | 按关键词搜索 |
| `upload_media` | 上传图片/媒体文件 |
| `extract_summary` | AI 提取摘要和关键词 |
| `get_stats` | 获取博客统计 |

## 开发

```bash
git clone https://github.com/anomalyco/quick-press-mcp.git
cd quick-press-mcp
npm install
npm run build
npm link  # 全局可用 `quick-press-mcp` 命令
```

## License

MIT
