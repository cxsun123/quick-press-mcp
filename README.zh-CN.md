<a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>

# quick-press-mcp

[![npm version](https://img.shields.io/npm/v/quick-press-mcp)](https://www.npmjs.com/package/quick-press-mcp)

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
npx quick-press-mcp@latest
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `QUICK_PRESS_MCP_URL` | 是 | 远程 MCP Server 地址，如 `https://xxx.vercel.app/api/mcp` |
| `QUICK_PRESS_MCP_API_KEY` | 是 | API key（如 `sk-xxx`）用于鉴权 |
| `ZHIHU_COOKIES` | 否 | 知乎 cookie（JSON 格式），用于绕过反扒，发布 zhuanlan.zhihu.com 文章时需要 |

### 知乎反扒支持

知乎会拦截程序化访问。发布 `zhuanlan.zhihu.com/p/xxx` 文章需要提供有效 cookie：

1. 在浏览器中登录 [zhihu.com](https://www.zhihu.com)
2. 打开 DevTools → Application → Cookies → `zhihu.com`
3. 导出 cookie 为 JSON 格式，包含 `cookies` 数组和 `d_c0` 值
4. 配置到环境变量或文件：

**环境变量方式：**
```bash
export ZHIHU_COOKIES='{"cookies":[{"name":"d_c0","value":"xxx","domain":".zhihu.com"},...],"d_c0":"xxx","savedAt":1700000000000}'
```

**文件方式**（存到 `~/.quick-press-mcp/zhihu-cookies.json`）：
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

添加到 `~/Library/Application Support/Claude/claude_desktop_config.json`：

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

添加到项目中的 `.cursor/mcp.json`（或对应配置文件）：

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

添加到 `~/.codex/config.toml`：

```toml
[mcp_servers.quick-press-mcp]
command = "npx"
args = ["-y", "quick-press-mcp@latest"]
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

## AGENTS.md / CLAUDE.md — 自动触发规则

在项目的 `AGENTS.md` 或 `CLAUDE.md` 中添加以下内容，让 AI Agent 自动调用 `publish` 工具：

```markdown
## MCP 自动调用规则 — 文章发布

当用户要求从 URL 或本地文件 发布文章 时，**直接调用** `publish` MCP 工具。
**不要自己抓取 URL 内容** — 工具内置抓取和 AI 重写。

| 用户 prompt 模式 | 参数 |
|---|---|
| `发布文章: {URL}` / `创建文章: {URL}` / `转载: {URL}` | `{ "url": "<URL>" }` |
| `发布本地文件: {PATH}` / `用这个PDF/DOCX生成文章: {PATH}` | `{ "filePath": "<PATH>" }` |
| 指定语言 | `{ "url": "<URL>", "language": "中文" }` |

`source_type` 根据 url/filePath 自动判断。

**规则：**
- 判断 PATH 是本地文件还是 URL，`filePath` → `publish({filePath})`，`url` → `publish({url})`
- DO NOT use `ctx_fetch_and_index`, `webfetch`, 或其他抓取工具 — 直接调用 `publish`，它内部处理抓取
- 文件类型自动处理：PDF/DOC/DOCX/ODT/RTF/PPT/PPTX → AI 重写；MD/HTML/TXT → 直接发布
- 若用户显式要求不同语言，传 `language` 参数
```

### 返回值

`publish` 工具返回以下 JSON：

| 字段 | 类型 | 说明 |
|---|---|---|
| `postId` | string | 文章的 UUID |
| `slug` | string | URL 标识 |
| `url` | string | 完整前台 URL（public/password）或相对路径（private） |
| `title` | string | 文章标题 |
| `summary` | string | AI 生成的摘要 |
| `keywords` | string[] | 提取的关键词 |
| `categories` | string[] | 分配的分类 |
| `tags` | string[] | 分配的标签 |
| `coverImage` | string\|null | 上传的封面图 URL |
| `imagesUploaded` | number | 文章中嵌入的图片数量 |
| `password_plaintext` | string | 仅当 `visibility=password` 时返回 |

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
| `list_posts` | 列出所有文章 |
| `get_post` | 根据 ID 获取文章详情 |
| `delete_post` | 永久删除文章 |
| `search_posts` | 按关键词搜索 |
| `upload_media` | 上传图片/媒体文件 |
| `get_stats` | 获取博客统计 |

## 开发

```bash
git clone https://github.com/anomalyco/quick-press-mcp.git
cd quick-press-mcp
npm install
npm run build
npm link  # 全局可用 `quick-press-mcp` 命令
```

### 发布

```bash
# Auth token 在 .npmrc 中（registry.npmjs.org）
# 如果全局 registry 设为镜像（如 npmmirror.com），需要覆盖：
npm version <new-version>
npm publish --registry=https://registry.npmjs.org
```

## License

MIT
