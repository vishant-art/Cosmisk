# Tools, Repositories & Token Management

> GitHub repos, Claude Code skills, and token optimization strategies.
> Updated each session with new tools discovered.

---

## Token Burning Solutions

### Problem: Context Window Fills Up
Claude Code has ~200K token context. Large codebases burn through this quickly.

### Solutions We Use

| Solution | How It Works | When to Use |
|----------|--------------|-------------|
| **Wiki Pattern** | Compress learnings into wiki pages, inject only `sprint.md` | Every session |
| **Thin Context** | CLAUDE.md stays <2K tokens, query wiki as needed | Default mode |
| **Code Review Graph** | MCP tool that indexes codebase, query instead of read | Before grep/read |
| **Explore Agent** | Subagent searches codebase, returns summary | Open-ended searches |
| **Background Tasks** | Run tests/builds in background, don't block context | Long-running commands |

### Token-Saving Habits
1. **Don't read entire files** — Read specific line ranges
2. **Use Glob before Grep** — Find files first, then search content
3. **Wiki over memory** — Store in wiki, not in conversation
4. **Summarize before continuing** — Compress long conversations

---

## GitHub Repositories (Installed)

### Claude Code Enhancements

| Repo | What It Does | Location | Stars |
|------|--------------|----------|-------|
| **oh-my-claudecode** | Multi-agent orchestration, 95+ skills | `~/.claude/` plugin | 4K+ |
| **gstack** | Garry Tan's skills (review, ship, QA, design) | `~/.claude/skills/` | 90K+ |
| **Karpathy Skills** | 4 principles (think, simplify, surgical, goal-driven) | In CLAUDE.md | 109K+ |

### Ad Intelligence Tools

| Repo | What It Does | Location |
|------|--------------|----------|
| **Meta Ads Spy** | Pull competitor ads from Meta Ad Library → Airtable | `~/.claude/skills/meta-ads-spy/` |
| **Arcads** | AI UGC video generation via Arcads API | `~/.claude/skills/arcads/` |

### MCP Servers (Connected)

| Server | What It Provides |
|--------|------------------|
| **context7** | Library docs fetching (React, Next.js, etc.) |
| **code-review-graph** | Codebase indexing, impact analysis |
| **sqlite** | Local database queries |
| **airtable** | Airtable CRUD operations |
| **gemini** | Gemini API for vision, analysis |
| **smashed-agency** | WordPress API for client sites |
| **railway-mcp-server** | Railway deployment management |

---

## Skills We Use Daily

### From oh-my-claudecode (OMC)

| Skill | Trigger | What It Does |
|-------|---------|--------------|
| `/autopilot` | "autopilot" | Full autonomous execution |
| `/ralph` | "ralph" | Self-referential loop until done |
| `/ultrawork` | "ulw" | Parallel execution engine |
| `/team` | `/team` | N coordinated agents |
| `/plan` | `/plan` | Strategic planning |
| `/verify` | `/verify` | Verify changes work |
| `/remember` | `/remember` | Save to project memory |

### From gstack

| Skill | What It Does |
|-------|--------------|
| `/review` | Code review on any branch |
| `/ship` | Ship the PR |
| `/qa` | QA test a staging URL |
| `/cso` | Security audit (OWASP + STRIDE) |
| `/investigate` | Root cause debugging |
| `/office-hours` | Product interrogation |

---

## When to Use What

| Task | Tool/Repo | Why |
|------|-----------|-----|
| **Search codebase** | `code-review-graph` MCP | Indexed, fast, token-efficient |
| **Find files** | `Glob` tool | Pattern matching |
| **Search content** | `Grep` tool | Regex search |
| **Multi-file changes** | `/autopilot` or `/ultrawork` | Parallel agents |
| **Code review** | `/review` (gstack) | Structured feedback |
| **Debug issue** | `/investigate` (gstack) | Root cause analysis |
| **Competitor ads** | Meta Ads Spy | Pulls from Ad Library |
| **Library docs** | `context7` MCP | Fresh documentation |
| **Test URL** | `/qa` (gstack) | Opens real browser |

---

## Repository Wishlist (To Explore)

| Repo | Why Interested | Status |
|------|----------------|--------|
| **cursor-tools** | More Cursor integrations | Not installed |
| **aider** | Alternative AI coding tool | Awareness only |
| **continue.dev** | VS Code AI extension | Not installed |

---

## Session Learnings: Tools

### May 17, 2026
- OMC auto-wrap pattern scales to 80+ agents
- `code-review-graph` MCP saves tokens vs reading files
- Wiki pattern (Karpathy) keeps context thin

### May 16, 2026
- gstack `/qa` opens real browser for testing
- context7 MCP replaces web search for library docs

---

## Related

- [[wiki-routing]] — Where learnings go
- [[context-routing]] — LLM context management
- [[linkedin-strategy]] — Tools for content creation
- [[FOUNDER_DIRECTIVES]] — Systems inventory

## Last Updated
2026-05-17 by Claude (Session 11)
