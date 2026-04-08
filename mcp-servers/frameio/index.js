#!/usr/bin/env node

/**
 * Frame.io MCP Server (V4 API)
 *
 * Wraps Frame.io V4 REST API as MCP tools for video review workflows.
 * Auth: Adobe IMS OAuth2 (token stored in .frameio-token.json)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = join(__dirname, ".frameio-token.json");
const TOKEN_URL = "https://ims-na1.adobelogin.com/ims/token/v3";
const BASE_URL = "https://api.frame.io/v4";

const CLIENT_ID = process.env.FRAMEIO_CLIENT_ID || "174dbcfc39814439a7380afd76d60c86";
const CLIENT_SECRET = process.env.FRAMEIO_CLIENT_SECRET || "";

let currentToken = process.env.FRAMEIO_TOKEN || "";
let accountId = "";

/* ------------------------------------------------------------------ */
/*  Token management                                                   */
/* ------------------------------------------------------------------ */

function loadTokenFromFile() {
  if (!existsSync(TOKEN_FILE)) return;
  const data = JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
  currentToken = data.access_token;
  if (data.account_id) accountId = data.account_id;
  const elapsed = Date.now() - data.created_at;
  const expiresMs = (data.expires_in - 300) * 1000;
  if (elapsed > expiresMs && data.refresh_token && CLIENT_SECRET) {
    return refreshToken(data.refresh_token);
  }
}

async function refreshToken(refreshTok) {
  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshTok,
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (res.ok) {
      const data = await res.json();
      currentToken = data.access_token;
      const existing = JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
      writeFileSync(TOKEN_FILE, JSON.stringify({
        ...existing,
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshTok,
        expires_in: data.expires_in,
        created_at: Date.now(),
      }, null, 2));
    }
  } catch { /* use existing token */ }
}

// Load token
if (!currentToken) await loadTokenFromFile();
if (!currentToken) {
  console.error("No token. Set FRAMEIO_TOKEN or run: node setup.js");
  process.exit(1);
}

// Discover account ID if not cached
if (!accountId) {
  try {
    const res = await fetch(`${BASE_URL}/accounts`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.data?.[0]?.id) {
        accountId = data.data[0].id;
        // Cache it in token file
        if (existsSync(TOKEN_FILE)) {
          const existing = JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
          existing.account_id = accountId;
          writeFileSync(TOKEN_FILE, JSON.stringify(existing, null, 2));
        }
      }
    }
  } catch { /* will fail later on tool calls */ }
}

/* ------------------------------------------------------------------ */
/*  HTTP helper                                                        */
/* ------------------------------------------------------------------ */

async function api(path, options = {}) {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${currentToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Frame.io ${res.status}: ${body}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Server                                                             */
/* ------------------------------------------------------------------ */

const server = new McpServer({ name: "frameio", version: "2.0.0" });

/* ---- Account & Workspaces ---- */

server.tool("get_account", "Get Frame.io account info", {}, async () => {
  const data = await api("/accounts");
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool(
  "list_workspaces",
  "List all workspaces (teams) in the account",
  {},
  async () => {
    const data = await api(`/accounts/${accountId}/workspaces`);
    const items = (data.data || data).map((w) => `- ${w.display_name || w.name} (id: ${w.id})`);
    return { content: [{ type: "text", text: items.join("\n") || "No workspaces." }] };
  }
);

/* ---- Projects ---- */

server.tool(
  "list_projects",
  "List projects in a workspace",
  { workspace_id: z.string().describe("Workspace ID") },
  async ({ workspace_id }) => {
    const data = await api(`/accounts/${accountId}/workspaces/${workspace_id}/projects`);
    const items = (data.data || data).map(
      (p) => `- ${p.name} (id: ${p.id}, root_folder: ${p.root_folder_id || "N/A"})`
    );
    return { content: [{ type: "text", text: items.join("\n") || "No projects." }] };
  }
);

server.tool(
  "get_project",
  "Get project details",
  { project_id: z.string().describe("Project ID") },
  async ({ project_id }) => {
    const data = await api(`/accounts/${accountId}/projects/${project_id}`);
    return { content: [{ type: "text", text: JSON.stringify(data.data || data, null, 2) }] };
  }
);

/* ---- Folders & Files ---- */

server.tool(
  "list_folder_children",
  "List all children (files and folders) inside a folder. Use project's root_folder_id for top-level.",
  {
    folder_id: z.string().describe("Folder ID (use root_folder_id from project for top-level)"),
  },
  async ({ folder_id }) => {
    const data = await api(`/accounts/${accountId}/folders/${folder_id}/children`);
    const items = (data.data || data).map((a) => {
      const type = a.type || "file";
      const dur = a.duration ? ` (${Math.round(a.duration)}s)` : "";
      const size = a.filesize ? ` [${(a.filesize / 1048576).toFixed(1)}MB]` : "";
      return `- [${type}] ${a.name}${dur}${size} (id: ${a.id})`;
    });
    return { content: [{ type: "text", text: items.join("\n") || "Empty folder." }] };
  }
);

server.tool(
  "get_file",
  "Get detailed info about a file (video/image) including duration, fps, thumbnail",
  { file_id: z.string().describe("File ID") },
  async ({ file_id }) => {
    const data = await api(`/accounts/${accountId}/files/${file_id}`);
    const f = data.data || data;
    const info = {
      id: f.id,
      name: f.name,
      type: f.type,
      duration: f.duration,
      fps: f.fps,
      filesize: f.filesize,
      thumb_url: f.thumb || f.thumbnail_url,
      label: f.label,
      description: f.description,
      created_at: f.created_at,
      comment_count: f.comment_count,
    };
    return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
  }
);

/* ---- Comments ---- */

server.tool(
  "list_comments",
  "List all comments on a file (video/image), including timestamps",
  { file_id: z.string().describe("File ID to list comments for") },
  async ({ file_id }) => {
    const data = await api(`/accounts/${accountId}/files/${file_id}/comments`);
    const items = (data.data || data).map((c) => {
      // V4 API returns timestamp in frames, convert to seconds for display
      const ts = c.timestamp != null ? ` @${fmtTs(c.timestamp / 30)}` : "";
      const owner = c.owner?.display_name || c.owner?.name || "Unknown";
      const done = c.completed ? " [DONE]" : "";
      return `- [${c.id}] ${owner}${ts}${done}: ${c.text}`;
    });
    return { content: [{ type: "text", text: items.join("\n") || "No comments." }] };
  }
);

server.tool(
  "post_comment",
  "Post a timestamped review comment on a video/image file",
  {
    file_id: z.string().describe("File ID to comment on"),
    text: z.string().describe("Comment text"),
    timestamp: z.number().optional().describe("Timestamp in seconds on the video timeline"),
    duration: z.number().optional().describe("Duration in seconds for range comments"),
  },
  async ({ file_id, text, timestamp, duration }) => {
    // Frame.io V4 API requires body wrapped in "data" object
    // Timestamp must be in frames or HH:MM:SS:FF format
    const commentData = { text };
    if (timestamp != null) {
      // Convert seconds to frame number (assuming 30fps as default)
      commentData.timestamp = Math.round(timestamp * 30);
    }
    if (duration != null) {
      commentData.duration = Math.round(duration * 30);
    }

    const data = await api(`/accounts/${accountId}/files/${file_id}/comments`, {
      method: "POST",
      body: JSON.stringify({ data: commentData }),
    });

    const c = data.data || data;
    const ts = c.timestamp != null ? ` @${fmtTs(c.timestamp / 30)}` : "";
    return {
      content: [{ type: "text", text: `Comment posted${ts}: "${c.text}" (id: ${c.id})` }],
    };
  }
);

server.tool(
  "post_comments_batch",
  "Post multiple timestamped review comments in one call. Ideal for posting a full edit review.",
  {
    file_id: z.string().describe("File ID to comment on"),
    comments: z.array(z.object({
      text: z.string().describe("Comment text"),
      timestamp: z.number().optional().describe("Timestamp in seconds"),
      duration: z.number().optional().describe("Duration in seconds"),
    })).describe("Array of comments to post"),
  },
  async ({ file_id, comments }) => {
    const results = [];
    for (const c of comments) {
      // Frame.io V4 API requires body wrapped in "data" object
      const commentData = { text: c.text };
      if (c.timestamp != null) {
        // Convert seconds to frame number (assuming 30fps)
        commentData.timestamp = Math.round(c.timestamp * 30);
      }
      if (c.duration != null) {
        commentData.duration = Math.round(c.duration * 30);
      }
      try {
        const data = await api(`/accounts/${accountId}/files/${file_id}/comments`, {
          method: "POST",
          body: JSON.stringify({ data: commentData }),
        });
        const r = data.data || data;
        const ts = r.timestamp != null ? ` @${fmtTs(r.timestamp / 30)}` : "";
        results.push(`OK${ts}: ${r.text}`);
      } catch (err) {
        results.push(`FAIL: ${c.text} — ${err.message}`);
      }
    }
    const ok = results.filter((r) => r.startsWith("OK")).length;
    return {
      content: [{ type: "text", text: `Posted ${ok}/${comments.length} comments:\n${results.join("\n")}` }],
    };
  }
);

server.tool(
  "update_comment",
  "Update an existing comment's text",
  {
    comment_id: z.string().describe("Comment ID"),
    text: z.string().describe("New text"),
  },
  async ({ comment_id, text }) => {
    // Frame.io V4 API requires body wrapped in "data" object
    const data = await api(`/accounts/${accountId}/comments/${comment_id}`, {
      method: "PATCH",
      body: JSON.stringify({ data: { text } }),
    });
    const c = data.data || data;
    return { content: [{ type: "text", text: `Updated: "${c.text}"` }] };
  }
);

server.tool(
  "delete_comment",
  "Delete a comment",
  { comment_id: z.string().describe("Comment ID") },
  async ({ comment_id }) => {
    await api(`/accounts/${accountId}/comments/${comment_id}`, { method: "DELETE" });
    return { content: [{ type: "text", text: `Deleted ${comment_id}` }] };
  }
);

server.tool(
  "resolve_comment",
  "Mark a comment as resolved/completed",
  {
    comment_id: z.string().describe("Comment ID"),
    completed: z.boolean().optional().describe("true to resolve, false to unresolve (default true)"),
  },
  async ({ comment_id, completed }) => {
    const data = await api(`/accounts/${accountId}/comments/${comment_id}`, {
      method: "PATCH",
      body: JSON.stringify({ completed: completed !== false }),
    });
    const c = data.data || data;
    return { content: [{ type: "text", text: `Comment ${c.completed ? "resolved" : "unresolved"}` }] };
  }
);

/* ---- Search ---- */

server.tool(
  "search_files",
  "Search for files by name within a folder (recursive, max 5 levels deep)",
  {
    folder_id: z.string().describe("Root folder ID to search within"),
    query: z.string().describe("Search term (case-insensitive)"),
  },
  async ({ folder_id, query }) => {
    const results = [];
    const q = query.toLowerCase();

    async function search(fid, depth = 0) {
      if (depth > 5) return;
      try {
        const data = await api(`/accounts/${accountId}/folders/${fid}/children`);
        for (const item of data.data || data) {
          if (item.name?.toLowerCase().includes(q)) results.push(item);
          if (item.type === "folder" && depth < 5) await search(item.id, depth + 1);
        }
      } catch { /* skip inaccessible folders */ }
    }

    await search(folder_id);
    const summary = results.map((a) => `- [${a.type}] ${a.name} (id: ${a.id})`).join("\n");
    return { content: [{ type: "text", text: summary || `No files matching "${query}".` }] };
  }
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtTs(seconds) {
  if (seconds == null) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/*  Start                                                              */
/* ------------------------------------------------------------------ */

const transport = new StdioServerTransport();
await server.connect(transport);
