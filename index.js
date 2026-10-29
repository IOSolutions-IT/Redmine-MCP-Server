#!/usr/bin/env node

/**
 * @oaxapps/redmine-mcp-server
 *
 * MCP Server for self-hosted Redmine with:
 * - Full issue CRUD (search, create, update, upsert)
 * - Auto-detect local user → Redmine user mapping
 * - Time tracking (log hours spent by AI on tasks)
 * - Automatic date tracking (start_date / due_date)
 *
 * Environment variables:
 *   REDMINE_URL          - Base URL of your Redmine instance
 *   REDMINE_API_KEY      - Your Redmine API key
 *   REDMINE_PROJECT_ID   - Default project ID (optional)
 *   REDMINE_USER_EMAIL   - Override email for user detection (optional)
 *   REDMINE_USER_ID      - Override Redmine user ID directly (optional)
 *   REDMINE_AUTO_DATES   - Auto-set start/due dates on status change (default: "true")
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ─── Configuration ───────────────────────────────────────────────────────────

const REDMINE_URL = (process.env.REDMINE_URL || "").replace(/\/+$/, "");
const REDMINE_API_KEY = process.env.REDMINE_API_KEY || "";
const DEFAULT_PROJECT_ID = process.env.REDMINE_PROJECT_ID || "";
const AUTO_DATES = process.env.REDMINE_AUTO_DATES !== "false"; // default true

if (!REDMINE_URL || !REDMINE_API_KEY) {
  console.error(
    "ERROR: REDMINE_URL and REDMINE_API_KEY environment variables are required."
  );
  process.exit(1);
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().split("T")[0]; // "2026-02-20"
}

/**
 * Status IDs that represent "work started" → set start_date
 * Commonly: In Progress (2), but configurable
 */
const IN_PROGRESS_STATUSES = new Set([2]);

/**
 * Status IDs that represent "work finished" → set due_date
 * Commonly: Resolved (3), Closed (5)
 */
const COMPLETED_STATUSES = new Set([3, 5]);

/**
 * Apply automatic date fields based on status change.
 * - Moving to In Progress → set start_date to today (if not already set)
 * - Moving to Resolved/Closed → set due_date to today
 */
async function applyAutoDates(issueObj, statusId, issueId) {
  if (!AUTO_DATES || !statusId) return;

  if (IN_PROGRESS_STATUSES.has(statusId)) {
    // Only set start_date if not already set on the issue
    if (issueId) {
      try {
        const existing = await redmineGet(`/issues/${issueId}.json`);
        if (!existing.issue.start_date) {
          issueObj.start_date = todayISO();
        }
      } catch {
        // If we can't fetch, set it anyway
        issueObj.start_date = todayISO();
      }
    } else {
      // New issue, always set start_date
      issueObj.start_date = todayISO();
    }
  }

  if (COMPLETED_STATUSES.has(statusId)) {
    issueObj.due_date = todayISO();
  }
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

async function redmineRequest(path, options = {}) {
  const url = `${REDMINE_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    "X-Redmine-API-Key": REDMINE_API_KEY,
    ...options.headers,
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Redmine API error ${res.status}: ${body}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function redmineGet(path) {
  return redmineRequest(path);
}

async function redminePost(path, body) {
  return redmineRequest(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function redminePut(path, body) {
  return redmineRequest(path, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

// ─── User Detection ──────────────────────────────────────────────────────────

function detectLocalUser() {
  const info = {
    userId: process.env.REDMINE_USER_ID || null,
    email: process.env.REDMINE_USER_EMAIL || null,
    gitEmail: null,
    gitName: null,
    systemUser: null,
  };

  try {
    info.gitEmail = execSync("git config user.email", {
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {}

  try {
    info.gitName = execSync("git config user.name", {
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {}

  info.systemUser =
    process.env.USER || process.env.USERNAME || process.env.LOGNAME || null;

  if (!info.gitEmail) {
    try {
      const gitconfig = readFileSync(join(homedir(), ".gitconfig"), "utf-8");
      const emailMatch = gitconfig.match(/email\s*=\s*(.+)/);
      if (emailMatch) info.gitEmail = emailMatch[1].trim();
      const nameMatch = gitconfig.match(/name\s*=\s*(.+)/);
      if (nameMatch) info.gitName = nameMatch[1].trim();
    } catch {}
  }

  return info;
}

async function findRedmineUser(localUser) {
  if (localUser.userId) {
    try {
      const data = await redmineGet(`/users/${localUser.userId}.json`);
      return data.user;
    } catch {}
  }

  const searchEmail = localUser.email || localUser.gitEmail;
  const searchName = localUser.gitName;
  const searchLogin = localUser.systemUser;

  try {
    const queries = [];
    if (searchEmail) queries.push(`name=${encodeURIComponent(searchEmail)}`);
    else if (searchName) queries.push(`name=${encodeURIComponent(searchName)}`);
    else if (searchLogin)
      queries.push(`name=${encodeURIComponent(searchLogin)}`);

    if (queries.length === 0) return null;

    const data = await redmineGet(`/users.json?${queries[0]}&limit=25`);
    const users = data.users || [];

    if (searchEmail) {
      const emailMatch = users.find(
        (u) => u.mail && u.mail.toLowerCase() === searchEmail.toLowerCase()
      );
      if (emailMatch) return emailMatch;
    }

    if (searchLogin) {
      const loginMatch = users.find(
        (u) => u.login && u.login.toLowerCase() === searchLogin.toLowerCase()
      );
      if (loginMatch) return loginMatch;
    }

    if (searchName) {
      const nameLower = searchName.toLowerCase();
      const nameMatch = users.find(
        (u) =>
          `${u.firstname} ${u.lastname}`.toLowerCase() === nameLower ||
          u.login.toLowerCase() === nameLower.replace(/\s+/g, "")
      );
      if (nameMatch) return nameMatch;
    }

    if (users.length === 1) return users[0];
  } catch {}

  try {
    const data = await redmineGet("/users/current.json");
    return data.user;
  } catch {}

  return null;
}

// ─── Time Tracking ───────────────────────────────────────────────────────────

const activeTimers = new Map();

// ─── MCP Server ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "redmine",
  version: "1.2.5",
});

// ── Tool: detect_user ────────────────────────────────────────────────────────

server.tool(
  "detect_user",
  "Detect the current local user and find their matching Redmine account. Uses git config, system username, and environment variables to identify the user.",
  {},
  async () => {
    try {
      const localUser = detectLocalUser();
      const redmineUser = await findRedmineUser(localUser);

      const result = {
        local: {
          git_email: localUser.gitEmail,
          git_name: localUser.gitName,
          system_user: localUser.systemUser,
          override_email: localUser.email,
          override_id: localUser.userId,
        },
        redmine: redmineUser
          ? {
              id: redmineUser.id,
              login: redmineUser.login,
              name: `${redmineUser.firstname} ${redmineUser.lastname}`,
              email: redmineUser.mail,
            }
          : null,
        matched: !!redmineUser,
      };

      return {
        content: [
          {
            type: "text",
            text: redmineUser
              ? `Detected local user → Redmine user #${redmineUser.id} (${redmineUser.firstname} ${redmineUser.lastname}, ${redmineUser.login})\n\n${JSON.stringify(result, null, 2)}`
              : `Could not match local user to a Redmine account.\n\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool: start_timer ────────────────────────────────────────────────────────

server.tool(
  "start_timer",
  "Start a timer for an issue. Call this when you BEGIN working on a task. The elapsed time will be logged to Redmine when you call stop_timer.",
  {
    issue_id: z.number().describe("The Redmine issue ID to track time for"),
    description: z
      .string()
      .optional()
      .describe("What you are working on (will appear in the time entry)"),
  },
  async (params) => {
    activeTimers.set(params.issue_id, {
      startTime: Date.now(),
      description: params.description || "Work performed via AI agent",
    });

    return {
      content: [
        {
          type: "text",
          text: `⏱ Timer started for issue #${params.issue_id} at ${new Date().toISOString()}. Call stop_timer when the task is complete to log the time.`,
        },
      ],
    };
  }
);

// ── Tool: stop_timer ─────────────────────────────────────────────────────────

server.tool(
  "stop_timer",
  "Stop the timer for an issue and log the elapsed time to Redmine as a time entry. Automatically detects the current user for the time entry.",
  {
    issue_id: z.number().describe("The Redmine issue ID to stop the timer for"),
    activity_id: z
      .number()
      .optional()
      .describe(
        "Time entry activity ID (e.g., Development, Design). Use list_time_entry_activities to see options."
      ),
    description: z
      .string()
      .optional()
      .describe("Override the description for the time entry"),
  },
  async (params) => {
    try {
      const timer = activeTimers.get(params.issue_id);
      if (!timer) {
        return {
          content: [
            {
              type: "text",
              text: `No active timer found for issue #${params.issue_id}. Use start_timer first.`,
            },
          ],
        };
      }

      const elapsedMs = Date.now() - timer.startTime;
      const elapsedHours = Math.round((elapsedMs / 3600000) * 100) / 100;
      const elapsedMinutes = Math.round(elapsedMs / 60000);
      const hoursToLog = Math.max(0.01, elapsedHours);

      const localUser = detectLocalUser();
      const redmineUser = await findRedmineUser(localUser);

      const timeEntry = {
        issue_id: params.issue_id,
        hours: hoursToLog,
        comments:
          params.description ||
          timer.description ||
          "Work performed via AI agent",
        spent_on: todayISO(),
      };

      if (params.activity_id) {
        timeEntry.activity_id = params.activity_id;
      }

      if (redmineUser) {
        timeEntry.user_id = redmineUser.id;
      }

      await redminePost("/time_entries.json", { time_entry: timeEntry });

      activeTimers.delete(params.issue_id);

      const userInfo = redmineUser
        ? ` (logged for ${redmineUser.firstname} ${redmineUser.lastname})`
        : "";

      return {
        content: [
          {
            type: "text",
            text: `⏱ Timer stopped for issue #${params.issue_id}. Logged ${hoursToLog}h (${elapsedMinutes} minutes)${userInfo} on ${todayISO()}.`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool: log_time ───────────────────────────────────────────────────────────

server.tool(
  "log_time",
  "Manually log a time entry for an issue (without using start/stop timer). Automatically assigns to the detected user.",
  {
    issue_id: z.number().describe("The Redmine issue ID"),
    hours: z
      .number()
      .describe("Hours spent (e.g., 0.5 for 30 minutes, 1.5 for 1h30m)"),
    description: z.string().optional().describe("What was done"),
    activity_id: z
      .number()
      .optional()
      .describe(
        "Activity ID. Use list_time_entry_activities to see options."
      ),
    spent_on: z
      .string()
      .optional()
      .describe(
        "Date the time was spent (YYYY-MM-DD). Defaults to today."
      ),
  },
  async (params) => {
    try {
      const localUser = detectLocalUser();
      const redmineUser = await findRedmineUser(localUser);

      const timeEntry = {
        issue_id: params.issue_id,
        hours: params.hours,
        comments: params.description || "Work performed via AI agent",
        spent_on: params.spent_on || todayISO(),
      };

      if (params.activity_id) timeEntry.activity_id = params.activity_id;
      if (redmineUser) timeEntry.user_id = redmineUser.id;

      await redminePost("/time_entries.json", { time_entry: timeEntry });

      const userInfo = redmineUser
        ? ` for ${redmineUser.firstname} ${redmineUser.lastname}`
        : "";

      return {
        content: [
          {
            type: "text",
            text: `Logged ${params.hours}h${userInfo} on issue #${params.issue_id} (${timeEntry.spent_on}).`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool: list_time_entry_activities ─────────────────────────────────────────

server.tool(
  "list_time_entry_activities",
  "List available time entry activities (Development, Design, etc.)",
  {},
  async () => {
    try {
      const data = await redmineGet("/enumerations/time_entry_activities.json");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data.time_entry_activities || [], null, 2),
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool: list_projects ──────────────────────────────────────────────────────

server.tool(
  "list_projects",
  "List all Redmine projects accessible with your API key",
  {},
  async () => {
    try {
      const data = await redmineGet("/projects.json?limit=100");
      const projects = (data.projects || []).map((p) => ({
        id: p.id,
        identifier: p.identifier,
        name: p.name,
        description: p.description,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool: list_statuses ──────────────────────────────────────────────────────

server.tool(
  "list_statuses",
  "List all available issue statuses in Redmine (useful to get status IDs)",
  {},
  async () => {
    try {
      const data = await redmineGet("/issue_statuses.json");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data.issue_statuses || [], null, 2),
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool: list_trackers ──────────────────────────────────────────────────────

server.tool(
  "list_trackers",
  "List all available trackers in Redmine (Bug, Feature, Task, etc.)",
  {},
  async () => {
    try {
      const data = await redmineGet("/trackers.json");
      return {
        content: [
          { type: "text", text: JSON.stringify(data.trackers || [], null, 2) },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool: search_issues ──────────────────────────────────────────────────────

server.tool(
  "search_issues",
  "Search Redmine issues by subject, project, status, or assignee. Returns matching issues.",
  {
    project_id: z
      .union([z.string(), z.number()])
      .optional()
      .describe(
        `Project ID or identifier${DEFAULT_PROJECT_ID ? ` (default: ${DEFAULT_PROJECT_ID})` : ""}`
      ),
    subject: z
      .string()
      .optional()
      .describe("Text to search for in issue subjects"),
    status: z
      .string()
      .optional()
      .describe(
        "Status filter: 'open', 'closed', '*' for all, or a specific status_id"
      ),
    assigned_to_id: z
      .union([z.string(), z.number()])
      .optional()
      .describe("Filter by assignee user ID, or 'me' for current user"),
    tracker_id: z.number().optional().describe("Filter by tracker ID"),
    limit: z
      .number()
      .optional()
      .default(25)
      .describe("Max results to return (default 25, max 100)"),
  },
  async (params) => {
    try {
      const query = new URLSearchParams();
      const projectId = params.project_id || DEFAULT_PROJECT_ID;
      if (projectId) query.set("project_id", String(projectId));
      if (params.status) query.set("status_id", params.status);
      if (params.assigned_to_id)
        query.set("assigned_to_id", String(params.assigned_to_id));
      if (params.tracker_id)
        query.set("tracker_id", String(params.tracker_id));
      query.set("limit", String(Math.min(params.limit || 25, 100)));
      query.set("sort", "updated_on:desc");

      const data = await redmineGet(`/issues.json?${query.toString()}`);
      let issues = data.issues || [];

      if (params.subject) {
        const search = params.subject.toLowerCase();
        issues = issues.filter(
          (i) =>
            i.subject.toLowerCase().includes(search) ||
            (i.description || "").toLowerCase().includes(search)
        );
      }

      const result = issues.map((i) => ({
        id: i.id,
        project: i.project?.name,
        tracker: i.tracker?.name,
        status: i.status?.name,
        priority: i.priority?.name,
        subject: i.subject,
        assigned_to: i.assigned_to?.name,
        done_ratio: i.done_ratio,
        start_date: i.start_date,
        due_date: i.due_date,
        updated_on: i.updated_on,
      }));

      return {
        content: [
          {
            type: "text",
            text:
              result.length > 0
                ? JSON.stringify(result, null, 2)
                : "No issues found matching the criteria.",
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool: get_issue ──────────────────────────────────────────────────────────

server.tool(
  "get_issue",
  "Get full details of a specific Redmine issue by ID",
  {
    issue_id: z.number().describe("The Redmine issue ID"),
    include: z
      .string()
      .optional()
      .describe(
        "Comma-separated associations to include: children,attachments,relations,changesets,journals,watchers"
      ),
  },
  async (params) => {
    try {
      const include = params.include ? `?include=${params.include}` : "";
      const data = await redmineGet(
        `/issues/${params.issue_id}.json${include}`
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data.issue, null, 2) }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool: create_issue ───────────────────────────────────────────────────────

server.tool(
  "create_issue",
  "Create a new issue in Redmine. Auto-assigns to detected user. Auto-sets start_date if status is In Progress, due_date if Resolved/Closed.",
  {
    project_id: z
      .union([z.string(), z.number()])
      .optional()
      .describe(
        `Project ID or identifier${DEFAULT_PROJECT_ID ? ` (default: ${DEFAULT_PROJECT_ID})` : " (required)"}`
      ),
    subject: z.string().describe("Issue subject/title (required)"),
    description: z.string().optional().describe("Issue description"),
    tracker_id: z
      .number()
      .optional()
      .describe(
        "Tracker ID (e.g., 1=Bug, 2=Feature, 3=Task). Use list_trackers to see options."
      ),
    status_id: z
      .number()
      .optional()
      .describe("Status ID. Use list_statuses to see options."),
    priority_id: z
      .number()
      .optional()
      .describe("Priority ID (typically 1=Low, 2=Normal, 3=High, 4=Urgent)"),
    assigned_to_id: z
      .number()
      .optional()
      .describe("User ID to assign. Auto-detects if not set."),
    parent_issue_id: z
      .number()
      .optional()
      .describe("Parent issue ID for sub-tasks"),
    estimated_hours: z
      .number()
      .optional()
      .describe("Estimated hours for the task"),
    done_ratio: z
      .number()
      .optional()
      .describe("Completion percentage (0-100)"),
    start_date: z
      .string()
      .optional()
      .describe("Start date (YYYY-MM-DD). Auto-set if status is In Progress."),
    due_date: z
      .string()
      .optional()
      .describe(
        "Due/end date (YYYY-MM-DD). Auto-set if status is Resolved/Closed."
      ),
    auto_assign: z
      .boolean()
      .optional()
      .default(true)
      .describe("Auto-assign to detected local user (default: true)"),
  },
  async (params) => {
    try {
      const projectId = params.project_id || DEFAULT_PROJECT_ID;
      if (!projectId) {
        return {
          content: [
            {
              type: "text",
              text: "Error: project_id is required. Set REDMINE_PROJECT_ID env var or pass it explicitly.",
            },
          ],
        };
      }

      const issue = {
        project_id: projectId,
        subject: params.subject,
      };

      if (params.description) issue.description = params.description;
      if (params.tracker_id) issue.tracker_id = params.tracker_id;
      if (params.status_id) issue.status_id = params.status_id;
      if (params.priority_id) issue.priority_id = params.priority_id;
      if (params.parent_issue_id)
        issue.parent_issue_id = params.parent_issue_id;
      if (params.estimated_hours)
        issue.estimated_hours = params.estimated_hours;
      if (params.done_ratio !== undefined) issue.done_ratio = params.done_ratio;

      // Explicit dates take priority
      if (params.start_date) issue.start_date = params.start_date;
      if (params.due_date) issue.due_date = params.due_date;

      // Auto-dates based on status (only if not explicitly set)
      if (!params.start_date || !params.due_date) {
        await applyAutoDates(issue, params.status_id, null);
      }

      // Auto-assign
      if (params.assigned_to_id) {
        issue.assigned_to_id = params.assigned_to_id;
      } else if (params.auto_assign !== false) {
        const localUser = detectLocalUser();
        const redmineUser = await findRedmineUser(localUser);
        if (redmineUser) issue.assigned_to_id = redmineUser.id;
      }

      const data = await redminePost("/issues.json", { issue });

      const dateInfo = [];
      if (issue.start_date) dateInfo.push(`start: ${issue.start_date}`);
      if (issue.due_date) dateInfo.push(`due: ${issue.due_date}`);
      const dateStr = dateInfo.length > 0 ? ` | Dates: ${dateInfo.join(", ")}` : "";

      return {
        content: [
          {
            type: "text",
            text: `Issue #${data.issue.id} created${dateStr}: ${REDMINE_URL}/issues/${data.issue.id}\n\n${JSON.stringify(data.issue, null, 2)}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool: update_issue ───────────────────────────────────────────────────────

server.tool(
  "update_issue",
  "Update an existing Redmine issue. Auto-sets start_date when moving to In Progress, due_date when moving to Resolved/Closed.",
  {
    issue_id: z.number().describe("The Redmine issue ID to update"),
    subject: z.string().optional().describe("New subject"),
    description: z.string().optional().describe("New description"),
    status_id: z
      .number()
      .optional()
      .describe("New status ID. Use list_statuses to see available statuses."),
    done_ratio: z
      .number()
      .optional()
      .describe("New completion percentage (0-100)"),
    assigned_to_id: z
      .number()
      .optional()
      .describe("New assignee user ID"),
    priority_id: z.number().optional().describe("New priority ID"),
    notes: z
      .string()
      .optional()
      .describe("Comment/notes to add to the issue"),
    estimated_hours: z
      .number()
      .optional()
      .describe("New estimated hours"),
    start_date: z
      .string()
      .optional()
      .describe(
        "Start date (YYYY-MM-DD). Auto-set when status changes to In Progress."
      ),
    due_date: z
      .string()
      .optional()
      .describe(
        "Due/end date (YYYY-MM-DD). Auto-set when status changes to Resolved/Closed."
      ),
  },
  async (params) => {
    try {
      const issue = {};
      if (params.subject) issue.subject = params.subject;
      if (params.description) issue.description = params.description;
      if (params.status_id) issue.status_id = params.status_id;
      if (params.done_ratio !== undefined) issue.done_ratio = params.done_ratio;
      if (params.assigned_to_id)
        issue.assigned_to_id = params.assigned_to_id;
      if (params.priority_id) issue.priority_id = params.priority_id;
      if (params.notes) issue.notes = params.notes;
      if (params.estimated_hours)
        issue.estimated_hours = params.estimated_hours;

      // Explicit dates take priority
      if (params.start_date) issue.start_date = params.start_date;
      if (params.due_date) issue.due_date = params.due_date;

      // Auto-dates based on status change
      if (!params.start_date && !params.due_date) {
        await applyAutoDates(issue, params.status_id, params.issue_id);
      } else if (!params.start_date && params.status_id) {
        // Only auto-set start_date
        if (IN_PROGRESS_STATUSES.has(params.status_id)) {
          try {
            const existing = await redmineGet(`/issues/${params.issue_id}.json`);
            if (!existing.issue.start_date) issue.start_date = todayISO();
          } catch {}
        }
      } else if (!params.due_date && params.status_id) {
        // Only auto-set due_date
        if (COMPLETED_STATUSES.has(params.status_id)) {
          issue.due_date = todayISO();
        }
      }

      await redminePut(`/issues/${params.issue_id}.json`, { issue });

      const dateInfo = [];
      if (issue.start_date) dateInfo.push(`start_date → ${issue.start_date}`);
      if (issue.due_date) dateInfo.push(`due_date → ${issue.due_date}`);
      const dateStr =
        dateInfo.length > 0 ? ` | Dates auto-set: ${dateInfo.join(", ")}` : "";

      return {
        content: [
          {
            type: "text",
            text: `Issue #${params.issue_id} updated${dateStr}: ${REDMINE_URL}/issues/${params.issue_id}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Tool: create_or_update_issue ─────────────────────────────────────────────

server.tool(
  "create_or_update_issue",
  "Find an issue by subject in a project. If it exists, update it. If not, create it. Auto-assigns user, auto-sets dates, and can log time.",
  {
    project_id: z
      .union([z.string(), z.number()])
      .optional()
      .describe(
        `Project ID or identifier${DEFAULT_PROJECT_ID ? ` (default: ${DEFAULT_PROJECT_ID})` : ""}`
      ),
    subject: z
      .string()
      .describe("Issue subject to search for (exact or partial match)"),
    status_id: z.number().optional().describe("Status ID to set"),
    done_ratio: z
      .number()
      .optional()
      .describe("Completion percentage (0-100)"),
    notes: z.string().optional().describe("Notes/comment to add"),
    description: z
      .string()
      .optional()
      .describe("Description (used on create)"),
    tracker_id: z
      .number()
      .optional()
      .describe("Tracker ID (used on create, e.g. 3=Task)"),
    priority_id: z
      .number()
      .optional()
      .describe("Priority ID (used on create)"),
    assigned_to_id: z
      .number()
      .optional()
      .describe("Assignee user ID (auto-detected if not set)"),
    start_date: z
      .string()
      .optional()
      .describe("Start date (YYYY-MM-DD). Auto-set on In Progress."),
    due_date: z
      .string()
      .optional()
      .describe("Due date (YYYY-MM-DD). Auto-set on Resolved/Closed."),
    hours_spent: z
      .number()
      .optional()
      .describe("Hours spent on this task. Logs a time entry if provided."),
  },
  async (params) => {
    try {
      const projectId = params.project_id || DEFAULT_PROJECT_ID;
      if (!projectId) {
        return {
          content: [
            {
              type: "text",
              text: "Error: project_id is required. Set REDMINE_PROJECT_ID env var or pass it explicitly.",
            },
          ],
        };
      }

      // Detect user
      const localUser = detectLocalUser();
      const redmineUser = await findRedmineUser(localUser);
      const assigneeId =
        params.assigned_to_id || (redmineUser ? redmineUser.id : null);

      // Search for existing issue
      const query = new URLSearchParams();
      query.set("project_id", String(projectId));
      query.set("status_id", "*");
      query.set("limit", "100");

      const data = await redmineGet(`/issues.json?${query.toString()}`);
      const search = params.subject.toLowerCase();
      const existing = (data.issues || []).find(
        (i) =>
          i.subject.toLowerCase() === search ||
          i.subject.toLowerCase().includes(search)
      );

      let issueId;
      let action;

      if (existing) {
        // UPDATE
        const issue = {};
        if (params.status_id) issue.status_id = params.status_id;
        if (params.done_ratio !== undefined)
          issue.done_ratio = params.done_ratio;
        if (params.notes) issue.notes = params.notes;
        if (assigneeId) issue.assigned_to_id = assigneeId;

        // Explicit dates
        if (params.start_date) issue.start_date = params.start_date;
        if (params.due_date) issue.due_date = params.due_date;

        // Auto-dates
        if (!params.start_date && !params.due_date) {
          await applyAutoDates(issue, params.status_id, existing.id);
        } else if (!params.start_date && IN_PROGRESS_STATUSES.has(params.status_id)) {
          if (!existing.start_date) issue.start_date = todayISO();
        } else if (!params.due_date && COMPLETED_STATUSES.has(params.status_id)) {
          issue.due_date = todayISO();
        }

        await redminePut(`/issues/${existing.id}.json`, { issue });
        issueId = existing.id;

        const dateInfo = [];
        if (issue.start_date) dateInfo.push(`start: ${issue.start_date}`);
        if (issue.due_date) dateInfo.push(`due: ${issue.due_date}`);
        const dateStr = dateInfo.length > 0 ? ` | ${dateInfo.join(", ")}` : "";

        action = `Updated issue #${existing.id} ("${existing.subject}")${dateStr}`;
      } else {
        // CREATE
        const issue = {
          project_id: projectId,
          subject: params.subject,
        };
        if (params.description) issue.description = params.description;
        if (params.tracker_id) issue.tracker_id = params.tracker_id;
        if (params.status_id) issue.status_id = params.status_id;
        if (params.priority_id) issue.priority_id = params.priority_id;
        if (assigneeId) issue.assigned_to_id = assigneeId;
        if (params.done_ratio !== undefined)
          issue.done_ratio = params.done_ratio;

        // Explicit dates
        if (params.start_date) issue.start_date = params.start_date;
        if (params.due_date) issue.due_date = params.due_date;

        // Auto-dates
        if (!params.start_date || !params.due_date) {
          await applyAutoDates(issue, params.status_id, null);
        }

        // Default: new issues get today as start_date
        if (!issue.start_date) {
          issue.start_date = todayISO();
        }

        const created = await redminePost("/issues.json", { issue });
        issueId = created.issue.id;

        if (params.notes) {
          await redminePut(`/issues/${issueId}.json`, {
            issue: { notes: params.notes },
          });
        }

        const dateInfo = [];
        if (issue.start_date) dateInfo.push(`start: ${issue.start_date}`);
        if (issue.due_date) dateInfo.push(`due: ${issue.due_date}`);
        const dateStr = dateInfo.length > 0 ? ` | ${dateInfo.join(", ")}` : "";

        action = `Created issue #${issueId} ("${params.subject}")${dateStr}`;
      }

      // Log time
      let timeInfo = "";
      if (params.hours_spent && params.hours_spent > 0) {
        const timeEntry = {
          issue_id: issueId,
          hours: params.hours_spent,
          comments: params.notes || "Work performed via AI agent",
          spent_on: todayISO(),
        };
        if (redmineUser) timeEntry.user_id = redmineUser.id;

        await redminePost("/time_entries.json", { time_entry: timeEntry });
        timeInfo = ` | Logged ${params.hours_spent}h`;
      }

      const userInfo = redmineUser
        ? ` | User: ${redmineUser.firstname} ${redmineUser.lastname}`
        : "";

      return {
        content: [
          {
            type: "text",
            text: `${action}${userInfo}${timeInfo}: ${REDMINE_URL}/issues/${issueId}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ── Start server ─────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
