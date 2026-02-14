# n8n MCP Server Setup

This project uses [n8n-MCP](https://github.com/czlonkowski/n8n-mcp) to enable AI assistants (Claude Desktop, Claude Code, etc.) to interact with the n8n workflow automation instance that powers Cosmisk's backend.

## What is n8n-MCP?

n8n-MCP is a Model Context Protocol (MCP) server that bridges n8n workflow automation with AI tools. It provides:

- Access to 1,084+ n8n node definitions with full property schemas
- Workflow management (create, read, update, activate/deactivate)
- 2,600+ pre-extracted workflow configurations from templates
- Community node discovery and documentation

## Prerequisites

- **Node.js** >= 18
- **n8n API key** from your n8n instance (Settings > API)

## Quick Start

### 1. Configure your n8n API key

Copy the environment template and add your API key:

```bash
cp .env.example .env
```

Edit `.env` and set your `N8N_API_KEY`.

### 2. Use with Claude Code (automatic)

The `.mcp.json` file in the project root auto-configures the n8n-MCP server for Claude Code. Just ensure your `N8N_API_KEY` is set in the `.mcp.json` file or your environment.

### 3. Use with Claude Desktop (manual)

Add the following to your Claude Desktop config file:

| OS | Config path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "npx",
      "args": ["-y", "n8n-mcp"],
      "env": {
        "MCP_MODE": "stdio",
        "LOG_LEVEL": "error",
        "DISABLE_CONSOLE_OUTPUT": "true",
        "N8N_API_URL": "https://n8n.cosmisk.ai",
        "N8N_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

## npm Scripts

| Script | Description |
|---|---|
| `npm run mcp:start` | Start the n8n-MCP server standalone |
| `npm run mcp:inspect` | Launch the MCP Inspector for debugging |

## Configuration Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `N8N_API_URL` | Yes | - | Your n8n instance URL (without `/webhook`) |
| `N8N_API_KEY` | Yes | - | API key from n8n Settings > API |
| `MCP_MODE` | Yes | - | Must be `stdio` for Claude integration |
| `LOG_LEVEL` | No | `error` | Logging verbosity: `error`, `warn`, `info`, `debug` |
| `DISABLE_CONSOLE_OUTPUT` | No | `true` | Suppress console output for clean MCP communication |
| `WEBHOOK_SECURITY_MODE` | No | `strict` | Set to `moderate` for local n8n instances |

## Cosmisk n8n Endpoints

The MCP server connects to `https://n8n.cosmisk.ai` which hosts the following webhook endpoints used by the Cosmisk frontend:

- **Auth**: `auth/login`, `auth/signup`, `auth/meta-oauth`, `auth/refresh`
- **Dashboard**: `dashboard/kpis`, `dashboard/chart`, `dashboard/insights`, `dashboard/top-creatives`
- **Creatives**: `creatives/list`, `creatives/detail`, `creatives/analyze`, `creatives/recommendations`
- **Director Lab**: `director/generate-brief`, `director/generate`, `director/publish`
- **UGC Studio**: `ugc/avatars`, `ugc/generate-script`, `ugc/generate-video`
- **Brain**: `brain/patterns`, `brain/compare`
- **AI**: `ai/chat`
- **Reports**: `reports/generate`, `reports/list`
- **Brands**: `brands/list`, `brands/switch`
- **Settings**: `settings/profile`, `settings/team`, `settings/billing`

## Safety Guidelines

- **Never** edit production workflows directly with AI - always work on copies
- **Always** test workflow changes in a development environment first
- **Export** backup of workflows before making changes
- **Validate** all changes before deploying to production

## Docker Alternative

If you prefer Docker over npx:

```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "-e", "MCP_MODE=stdio",
        "-e", "LOG_LEVEL=error",
        "-e", "DISABLE_CONSOLE_OUTPUT=true",
        "-e", "N8N_API_URL=https://n8n.cosmisk.ai",
        "-e", "N8N_API_KEY=your-api-key-here",
        "ghcr.io/czlonkowski/n8n-mcp:latest"
      ]
    }
  }
}
```
