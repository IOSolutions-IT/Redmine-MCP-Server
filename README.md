# @oaxapps/redmine-mcp-server

MCP (Model Context Protocol) server for **self-hosted Redmine**. Connect your AI coding tools to Redmine to search, create, and update issues directly from your IDE.

**Features:**
- 🔍 Search, create, update, and upsert issues
- 👤 **Auto-detect local user** → maps to Redmine account (via git config, system user)
- ⏱ **Time tracking** — start/stop timers or log hours, automatically recorded in Redmine
- 📅 **Automatic date tracking** — sets `start_date` when work begins, `due_date` when resolved
- 📋 Auto-assign issues to the detected user

Works with: **Claude Code** · **Google Antigravity** · **Cursor** · **Windsurf** · **OpenCode** · **Claude Desktop** · **VS Code Copilot** · and any MCP-compatible client.

---

## Prerequisites

1. **Node.js 18+**
2. **Redmine REST API enabled**: `Administration → Settings → API → Enable REST web service`
3. **API key**: `My Account → API access key` (right sidebar)

---

## Installation & Setup

### Claude Code

```bash
claude mcp add redmine -s user \
  -e REDMINE_URL=https://your-redmine.com \
  -e REDMINE_API_KEY=your_key \
  -e REDMINE_PROJECT_ID=40 \
  -- npx -y @oaxapps/redmine-mcp-server
```

> Use `-s user` for all projects or `-s local` for current project only.

---

### Google Antigravity

1. Open the **Agent panel** → click **"..."** → **MCP Servers**
2. Click **"Manage MCP Servers"** → **"View raw config"**
3. This opens `mcp_config.json` at:
   - **macOS/Linux:** `~/.gemini/antigravity/mcp_config.json`
   - **Windows:** `C:\Users\<USERNAME>\.gemini\antigravity\mcp_config.json`

**Method 1 — Using npx:**

```json
{
  "mcpServers": {
    "redmine": {
      "command": "npx",
      "args": ["-y", "@oaxapps/redmine-mcp-server"],
      "env": {
        "REDMINE_URL": "https://your-redmine.com",
        "REDMINE_API_KEY": "your_key",
        "REDMINE_PROJECT_ID": "40"
      }
    }
  }
}
```

**Method 2 — If you get `npx not found in $PATH` error:**

Find your full paths:

```bash
which node
npm root -g
```

Install globally and use full paths:

```bash
npm install -g @oaxapps/redmine-mcp-server
```

```json
{
  "mcpServers": {
    "redmine": {
      "command": "/full/path/to/node",
      "args": ["/full/path/to/global/node_modules/@oaxapps/redmine-mcp-server/index.js"],
      "env": {
        "REDMINE_URL": "https://your-redmine.com",
        "REDMINE_API_KEY": "your_key",
        "REDMINE_PROJECT_ID": "40"
      }
    }
  }
}
```

4. Click **Refresh** on the Manage MCPs page

---

### Cursor / Windsurf

Add to `.cursor/mcp.json` or your Windsurf MCP config:

```json
{
  "mcpServers": {
    "redmine": {
      "command": "npx",
      "args": ["-y", "@oaxapps/redmine-mcp-server"],
      "env": {
        "REDMINE_URL": "https://your-redmine.com",
        "REDMINE_API_KEY": "your_key",
        "REDMINE_PROJECT_ID": "40"
      }
    }
  }
}
```

If you get a PATH error, use the full path method described in the Antigravity section above.

---

### OpenCode

**Project-level** — add to `opencode.json` in your project root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "redmine": {
      "type": "local",
      "command": ["npx", "-y", "@oaxapps/redmine-mcp-server"],
      "environment": {
        "REDMINE_URL": "https://your-redmine.com",
        "REDMINE_API_KEY": "your_key",
        "REDMINE_PROJECT_ID": "40"
      },
      "enabled": true
    }
  }
}
```

**Global (all projects)** — add to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "redmine": {
      "type": "local",
      "command": ["npx", "-y", "@oaxapps/redmine-mcp-server"],
      "environment": {
        "REDMINE_URL": "https://your-redmine.com",
        "REDMINE_API_KEY": "your_key"
      },
      "enabled": true
    }
  }
}
```

> When installed globally, omit `REDMINE_PROJECT_ID` — the agent will specify the project per task, or you can set it per-project in the project-level `opencode.json`.

**If you get a PATH error**, use full paths:

```bash
which node
npm root -g
npm install -g @oaxapps/redmine-mcp-server
```

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "redmine": {
      "type": "local",
      "command": ["/full/path/to/node", "/full/path/to/global/node_modules/@oaxapps/redmine-mcp-server/index.js"],
      "environment": {
        "REDMINE_URL": "https://your-redmine.com",
        "REDMINE_API_KEY": "your_key",
        "REDMINE_PROJECT_ID": "40"
      },
      "enabled": true
    }
  }
}
```

Verify with `opencode mcp list`. Optionally add to your `AGENTS.md`:

```markdown
When working on tasks, use the `redmine` tools to track progress in Redmine.
```

---

### Claude Desktop

Add to `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "redmine": {
      "command": "npx",
      "args": ["-y", "@oaxapps/redmine-mcp-server"],
      "env": {
        "REDMINE_URL": "https://your-redmine.com",
        "REDMINE_API_KEY": "your_key",
        "REDMINE_PROJECT_ID": "40"
      }
    }
  }
}
```

---

## Available Tools

### Issue Management

| Tool | Description |
|------|-------------|
| `list_projects` | List all accessible projects |
| `list_statuses` | List issue statuses with IDs |
| `list_trackers` | List trackers (Bug, Feature, Task…) |
| `search_issues` | Search by project, subject, status, assignee |
| `get_issue` | Get full issue details by ID |
| `create_issue` | Create a new issue (auto-assigns user, auto-sets dates) |
| `update_issue` | Update status, done%, notes, assignee (auto-sets dates) |
| `create_or_update_issue` | **Smart upsert** — find by subject, update or create |
| `upload_attachment` | Upload a local file (screenshot, log, HAR, PDF…) and attach it to an issue |

### User Detection

| Tool | Description |
|------|-------------|
| `detect_user` | Detect local user and show matched Redmine account |

### Time Tracking

| Tool | Description |
|------|-------------|
| `start_timer` | Start a timer when beginning work on an issue |
| `stop_timer` | Stop the timer and log elapsed time to Redmine (optional `hours` overrides the elapsed time) |
| `cancel_timer` | Discard a running timer without logging anything |
| `log_time` | Manually log hours spent on an issue |
| `list_time_entries` | List time entries filtered by issue, project, user (`"me"`), and date range |
| `update_time_entry` | Change hours, activity, comment, date, or issue of a time entry |
| `delete_time_entry` | Delete a time entry |
| `list_time_entry_activities` | List available activity types (Development, Design…) |

---

## How Automatic Features Work

### 👤 User Detection

The server identifies the local user through this priority chain:

```
1. REDMINE_USER_ID env var        → direct match by ID
2. REDMINE_USER_EMAIL env var     → match by email
3. git config user.email          → match by email in Redmine
4. git config user.name           → match by name in Redmine
5. $USER / $USERNAME              → match by login in Redmine
6. Fallback                       → current API key owner
```

Issues are **auto-assigned** to the matched user when created. Time entries are automatically attributed to the detected user.

### 📅 Automatic Date Tracking

The server manages `start_date` and `due_date` based on status changes:

| When status changes to... | What happens |
|--------------------------|-------------|
| → **In Progress** (status 2) | `start_date` set to today (only if not already set) |
| → **Resolved** (status 3) | `due_date` set to today |
| → **Closed** (status 5) | `due_date` set to today |
| New issue created | `start_date` set to today |

You can override by passing explicit `start_date` or `due_date` values. Disable with `REDMINE_AUTO_DATES=false`.

### ⏱ Time Tracking

Call `start_timer` when work begins and `stop_timer` when done. The elapsed time is calculated automatically and logged as a Redmine time entry with the correct user and date.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REDMINE_URL` | ✅ | Base URL of your Redmine (e.g., `https://redmine.example.com`) |
| `REDMINE_API_KEY` | ✅ | API key from My Account page |
| `REDMINE_PROJECT_ID` | ❌ | Default project ID (saves you from specifying it every time) |
| `REDMINE_USER_ID` | ❌ | Override: directly set the Redmine user ID |
| `REDMINE_USER_EMAIL` | ❌ | Override: match by email instead of auto-detection |
| `REDMINE_AUTO_DATES` | ❌ | Auto-set start/due dates on status change (default: `"true"`) |
| `REDMINE_DEFAULT_ACTIVITY_ID` | ❌ | Activity ID for time entries logged without `activity_id`. If unset, Redmine's default activity is used; if there is none, the tool returns an error listing the available activities |

---

## Usage Examples

### Basic issue management
```
Show me all open issues in project 40
Update Redmine issue #142 to Resolved with 100% done
Create a bug: "Fix timeout on /users endpoint" with high priority
```

### User detection
```
Who am I in Redmine?
```

### Time tracking with timer
```
Start a timer for issue #142, I'm working on the login feature
... (AI works on the task) ...
Stop the timer for issue #142 and log the time
```

### Time tracking with manual hours
```
Log 2.5 hours on issue #142 for implementing authentication
```

### Smart upsert with time and dates
```
Mark "User authentication" as done in project 40. Log 1.5 hours spent.
If it doesn't exist, create it.
```

---

## AI Agent Integration (PRD / CLAUDE.md / Skills)

Copy this section into your project's `CLAUDE.md` (Claude Code), `Skills` (Antigravity), or PRD file so the AI agent automatically follows the Redmine workflow:

---

### Redmine Integration

This project is tracked in Redmine. All AI agents working on this codebase must keep Redmine in sync.

**Connection:**
- **Project ID**: `40` (change to your project)
- **MCP Server**: `@oaxapps/redmine-mcp-server`

**Status IDs:**

| ID | Status |
|----|--------|
| 1  | New |
| 2  | In Progress |
| 3  | Resolved |
| 5  | Closed |

**User Assignment:**
- Issues are auto-assigned to the current developer via git config detection.
- Do NOT hardcode user IDs — the MCP server detects the correct Redmine user automatically.
- Run `detect_user` to verify the mapping is correct.

**Date Tracking (Automatic):**
- `start_date` is auto-set to today when an issue moves to In Progress (status 2).
- `due_date` is auto-set to today when an issue moves to Resolved (status 3) or Closed (status 5).
- New issues get today as `start_date` by default.
- You can override dates by passing `start_date` or `due_date` explicitly.

**Time Tracking:**
- Always call `start_timer` when beginning work on an issue.
- Always call `stop_timer` when the task is completed — this logs the elapsed time to Redmine automatically.
- If you forget to start a timer, use `log_time` with an estimated duration.
- Time is attributed to the detected user automatically.

**Rules:**

1. **Before starting a task**: Search Redmine for a matching issue. If it exists, update its status to `In Progress` (status_id: 2). The `start_date` will be set automatically. Then call `start_timer`.
2. **If no issue exists**: Create one using `create_issue` with the appropriate subject, description, tracker, and `estimated_hours` (estimate how long the task will take). The `start_date` is set automatically. Then call `start_timer`.
3. **When a task is completed**: Call `stop_timer` to log the time. Then update the issue to `Resolved` (status_id: 3) with `done_ratio: 100`. The `due_date` will be set automatically.
4. **Always add a note** describing what was done, including relevant file names or changes.
5. **Partial progress**: If a task is partially done, update `done_ratio` to reflect the percentage (e.g., 30, 50, 70). Do NOT stop the timer — leave it running. Do NOT change the status.
6. **Bug fixes**: Use `update_issue` to add a note explaining the fix and set status to `Resolved`.

**Required fields checklist (every task must have):**
- ✅ `start_timer` called at the beginning → logs spent time
- ✅ `stop_timer` called at the end → logs spent time
- ✅ `estimated_hours` set on create (your best estimate)
- ✅ `done_ratio` set to 100 when complete
- ✅ `status_id: 2` (In Progress) when starting → auto-sets `start_date`
- ✅ `status_id: 3` (Resolved) when done → auto-sets `due_date`
- ✅ `notes` with description of changes and files modified

**Example Workflow:**

```
1. User says: "Add password reset feature"

2. Agent searches Redmine:
   search_issues(project_id: "40", subject: "password reset")

3. If found → update to In Progress (start_date auto-set):
   update_issue(issue_id: 142, status_id: 2, notes: "Starting implementation")

4. If not found → create (start_date auto-set):
   create_issue(project_id: "40", subject: "Add password reset feature",
     tracker_id: 2, status_id: 2, estimated_hours: 2)

5. Start timer:
   start_timer(issue_id: 142, description: "Implementing password reset")

6. Agent implements the feature...

7. Stop timer (logs elapsed time):
   stop_timer(issue_id: 142) → logs 0.35h

8. Mark as resolved (due_date auto-set):
   update_issue(issue_id: 142, status_id: 3, done_ratio: 100,
     notes: "Implemented password reset via email token.
     Files: src/auth/reset.ts, src/email/templates/reset.html")

Result in Redmine:
  Issue #142: "Add password reset feature"
  Status:         Resolved
  Assigned to:    Carlos O. (auto-detected)
  Start date:     2026-02-20 (auto-set)
  Due date:       2026-02-20 (auto-set)
  Estimated time: 2h
  Spent time:     0.35h (from stop_timer)
  Done:           100%
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `npx not found in $PATH` | Use full paths to `node` and the package. See Antigravity section above. |
| `401 Unauthorized` | Check API key. Ensure REST API is enabled in Redmine admin settings. |
| `422 Unprocessable Entity` | Verify status_id, tracker_id, project_id are valid. Use `list_statuses`. |
| `403 Forbidden` | Your Redmine user may lack permissions for that project/action. |
| User not detected | Run `detect_user` to debug. Set `REDMINE_USER_EMAIL` as override. |
| Time not logging | Check that time tracking is enabled in Redmine. Run `list_time_entry_activities`. |
| Dates not updating | Ensure `REDMINE_AUTO_DATES` is not set to `"false"`. Check Redmine workflow allows the status transition. |
| Server not connecting | Run `REDMINE_URL=... REDMINE_API_KEY=... npx @oaxapps/redmine-mcp-server` in terminal to check for errors. |

## License

MIT
