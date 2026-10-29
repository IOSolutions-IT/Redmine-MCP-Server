import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setup, ACTIVITIES } from "./harness.js";

const ACTIVITIES_PATH = "/enumerations/time_entry_activities.json";

beforeEach(() => {
  delete process.env.REDMINE_DEFAULT_ACTIVITY_ID;
});

const loggedActivity = (requests) =>
  JSON.parse(requests("POST", "/time_entries.json")[0].body).time_entry.activity_id;

test("explicit activity_id wins and skips resolution", async () => {
  process.env.REDMINE_DEFAULT_ACTIVITY_ID = "4";
  const { call, requests } = await setup({ "POST /time_entries.json": null });

  await call("log_time", { issue_id: 1, hours: 1, activity_id: 8 });

  assert.equal(loggedActivity(requests), 8);
  assert.equal(requests("GET", ACTIVITIES_PATH).length, 0);
});

test("REDMINE_DEFAULT_ACTIVITY_ID is used before querying Redmine", async () => {
  process.env.REDMINE_DEFAULT_ACTIVITY_ID = "4";
  const { call, requests } = await setup({
    "POST /time_entries.json": null,
    [`GET ${ACTIVITIES_PATH}`]: ACTIVITIES,
  });

  await call("log_time", { issue_id: 1, hours: 1 });

  assert.equal(loggedActivity(requests), 4);
  assert.equal(requests("GET", ACTIVITIES_PATH).length, 0);
});

test("invalid REDMINE_DEFAULT_ACTIVITY_ID is reported", async () => {
  process.env.REDMINE_DEFAULT_ACTIVITY_ID = "dev";
  const { call, requests } = await setup({ "POST /time_entries.json": null });

  const text = await call("log_time", { issue_id: 1, hours: 1 });

  assert.match(text, /^Error: .*REDMINE_DEFAULT_ACTIVITY_ID/);
  assert.equal(requests("POST", "/time_entries.json").length, 0);
});

test("falls back to the is_default activity and caches it per process", async () => {
  const { call, requests } = await setup({
    "POST /time_entries.json": null,
    [`GET ${ACTIVITIES_PATH}`]: ACTIVITIES,
  });

  await call("log_time", { issue_id: 1, hours: 1 });
  await call("log_time", { issue_id: 2, hours: 2 });

  const posts = requests("POST", "/time_entries.json");
  assert.equal(posts.length, 2);
  for (const p of posts) assert.equal(JSON.parse(p.body).time_entry.activity_id, 9);
  assert.equal(requests("GET", ACTIVITIES_PATH).length, 1);
});

test("no default activity returns an error listing the options", async () => {
  const { call, requests } = await setup({
    "POST /time_entries.json": null,
    [`GET ${ACTIVITIES_PATH}`]: {
      time_entry_activities: [
        { id: 8, name: "Design", is_default: false },
        { id: 9, name: "Development", is_default: false },
      ],
    },
  });

  const text = await call("log_time", { issue_id: 1, hours: 1 });

  assert.match(text, /^Error: /);
  assert.match(text, /activity_id/);
  assert.match(text, /REDMINE_DEFAULT_ACTIVITY_ID/);
  assert.match(text, /8.*Design/);
  assert.match(text, /9.*Development/);
  assert.equal(requests("POST", "/time_entries.json").length, 0);
});

test("stop_timer resolves the default activity and keeps the timer on failure", async () => {
  const routes = {
    "POST /time_entries.json": null,
    [`GET ${ACTIVITIES_PATH}`]: { time_entry_activities: [] },
  };
  const { call, requests } = await setup(routes);
  await call("start_timer", { issue_id: 3 });

  const failed = await call("stop_timer", { issue_id: 3 });
  assert.match(failed, /^Error: /);
  assert.equal(requests("POST", "/time_entries.json").length, 0);

  process.env.REDMINE_DEFAULT_ACTIVITY_ID = "4";
  const ok = await call("stop_timer", { issue_id: 3 });
  assert.match(ok, /Timer stopped/);
  assert.equal(loggedActivity(requests), 4);
});

test("create_or_update_issue applies the default activity when logging time", async () => {
  process.env.REDMINE_DEFAULT_ACTIVITY_ID = "4";
  const { call, requests } = await setup({
    "GET /issues.json": { issues: [{ id: 50, subject: "Task A" }] },
    "GET /issues/50.json": { issue: { id: 50, start_date: "2026-10-01" } },
    "PUT /issues/50.json": null,
    "POST /time_entries.json": null,
  });

  await call("create_or_update_issue", {
    project_id: 1,
    subject: "Task A",
    hours_spent: 0.5,
  });

  assert.equal(loggedActivity(requests), 4);
});
