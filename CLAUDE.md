# Cosmisk - AI Creative Intelligence Platform

## Project Overview

Cosmisk is an AI-powered creative optimization SaaS for e-commerce/DTC brands, focused on Meta/Facebook ad performance. The entire backend runs on **n8n workflows** exposed as webhook endpoints at `https://n8n.cosmisk.ai`. The frontend is Angular 17 (standalone components).

## Architecture

- **Frontend**: Angular 17 (`src/app/`) — calls n8n webhook endpoints via `ApiService`
- **Backend**: n8n workflows — all business logic, AI processing, auth, and data pipelines
- **MCP Integration**: `.mcp.json` connects Claude Code to the n8n instance for workflow management

## n8n MCP Tools Available

When running with the n8n-MCP server, you have access to:
- `search_nodes` — Find n8n nodes by keyword
- `get_node` — Get node schema, docs, properties
- `validate_node` — Validate node configuration
- `search_templates` / `get_template` — Browse 2,600+ workflow templates
- `validate_workflow` — Validate complete workflow JSON
- `n8n_create_workflow` — Deploy workflow to n8n instance
- `n8n_list_workflows` / `n8n_get_workflow` — List and inspect existing workflows
- `n8n_update_full_workflow` / `n8n_update_partial_workflow` — Modify workflows
- `n8n_test_workflow` — Test webhook/chat/form triggers
- `n8n_executions` — Monitor execution history and debug errors
- `n8n_deploy_template` — Deploy community templates directly

## Existing Webhook Endpoints (Production)

Base: `https://n8n.cosmisk.ai/webhook/`

| Category | Endpoints |
|----------|-----------|
| Auth | `auth/login`, `auth/signup`, `auth/meta-oauth`, `auth/refresh` |
| Dashboard | `dashboard/kpis`, `dashboard/chart`, `dashboard/insights`, `dashboard/top-creatives` |
| Creatives | `creatives/list`, `creatives/detail`, `creatives/analyze`, `creatives/recommendations` |
| Director Lab | `director/generate-brief`, `director/generate`, `director/publish` |
| UGC Studio | `ugc/avatars`, `ugc/generate-script`, `ugc/generate-video` |
| Brain | `brain/patterns`, `brain/compare` |
| AI | `ai/chat` |
| Reports | `reports/generate`, `reports/list` |
| Brands | `brands/list`, `brands/switch` |
| Settings | `settings/profile`, `settings/team`, `settings/billing` |
| Onboarding | `onboarding/connect`, `onboarding/scan`, `onboarding/goals`, `onboarding/competitors` |

## Agency Automation Workflows

When building agency automation workflows, follow this process:

### Workflow Development Process
1. **Research** — Use `search_nodes` and `search_templates` to find relevant nodes and patterns
2. **Design** — Plan the workflow: trigger → processing → output
3. **Validate nodes** — Use `validate_node` on each node config before assembly
4. **Validate workflow** — Use `validate_workflow` on the complete workflow JSON
5. **Deploy** — Use `n8n_create_workflow` to deploy to the n8n instance
6. **Test** — Use `n8n_test_workflow` to trigger and verify
7. **Debug** — Use `n8n_executions` with mode='error' if issues arise

### Key Agency Automation Categories
- **Client Onboarding** — Meta OAuth, creative scanning, goal setting, competitor tracking
- **Performance Monitoring** — KPI alerts, budget pacing, CPA/ROAS thresholds
- **Creative Pipeline** — Brief generation, creative generation, approval workflows
- **Reporting** — Scheduled reports, client-facing dashboards, Slack/email delivery
- **Ad Management** — Pause/enable rules, budget scaling, audience management
- **Client Communication** — Slack notifications, email updates, chat support

### Conventions
- Workflow names: `[Cosmisk] Category - Description` (e.g., `[Cosmisk] Onboarding - Meta OAuth Flow`)
- Always validate before deploying
- Use webhook triggers for API endpoints consumed by the Angular frontend
- Use schedule triggers for periodic automations (monitoring, reporting)
- Use chat triggers for AI-powered conversational workflows

## Safety Rules
- **Never** modify production workflows directly — always create copies
- **Always** validate workflows before deploying
- **Export** backups before making changes to existing workflows
- Test in development environment first when possible
