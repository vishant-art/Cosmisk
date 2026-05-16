# Cosmisk Wiki Schema

## Purpose
This wiki is maintained by Claude Code following Karpathy's LLM Wiki pattern.
Claude INGESTS raw sources, QUERIES the wiki, and LINTS for consistency.

## Structure Rules

### Page Types
1. **Architecture Pages** (`architecture/`) - System design, how things work
2. **Client Pages** (`clients/`) - Per-client learnings, trust journeys, what works
3. **Pattern Pages** (`patterns/`) - Cross-client learnings, anti-patterns
4. **Current Pages** (`current/`) - Active sprint, blockers, decisions
5. **Raw Sources** (`raw/`) - IMMUTABLE, Claude reads only, never modifies

### Linking Rules
- Use `[[Page Name]]` for internal links
- Every page must link to at least one other page
- Client pages must link to relevant pattern pages
- Architecture pages must link to implementation files

### Page Template
```markdown
# Page Title

## Summary
One paragraph overview.

## Details
Main content.

## Links
- [[Related Page 1]]
- [[Related Page 2]]

## Sources
- `file/path.ts:123` - specific code reference
- Session 2026-05-15 - conversation reference

## Last Updated
YYYY-MM-DD by [Claude/Human]
```

## Operations

### INGEST (End of Session)
1. Summarize what was learned
2. Update relevant wiki pages
3. Add cross-references
4. Update `current/sprint.md`

### QUERY (Start of Session)
1. Read `current/sprint.md` (injected into CLAUDE.md)
2. Query specific pages as needed
3. File new insights back to wiki

### LINT (Weekly)
1. Check for contradictions across pages
2. Find stale claims (>30 days without update)
3. Identify orphaned pages (no incoming links)
4. Verify code references still exist

## CLAUDE.md Injection
The contents of `current/sprint.md` are injected into CLAUDE.md.
This provides compressed context without reading the full wiki.
