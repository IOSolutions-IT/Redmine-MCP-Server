import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./harness.js";

const ENTRY = {
  id: 100,
  project: { id: 1, name: "P" },
  issue: { id: 42 },
  user: { id: 7, name: "Ann Lee" },
  activity: { id: 9, name: "Development" },
  hours: 1.5,
  comments: "Fix bug",
  spent_on: "2026-10-28",
  created_on: "2026-10-28T10:00:00Z",
};

test("list_time_entries passes filters and returns the selected fields", async () => {
  const { call, requests } = await setup({
    "GET /time_entries.json": { time_entries: [ENTRY], total_count: 1 },
  });

  const text = await call("list_time_entries", {
    issue_id: 42,
    project_id: "ios",
    user_id: "me",
    from: "2026-10-01",
    to: "2026-10-31",
    limit: 10,
  });

  const [req] = requests("GET", "/time_entries.json");
  const q = req.url.searchParams;
  assert.equal(q.get("issue_id"), "42");
  assert.equal(q.get("project_id"), "ios");
  assert.equal(q.get("user_id"), "me");
  assert.equal(q.get("from"), "2026-10-01");
  assert.equal(q.get("to"), "2026-10-31");
  assert.equal(q.get("limit"), "10");

  const json = JSON.parse(text.slice(text.indexOf("[")));
  assert.deepEqual(json, [
    {
      id: 100,
      issue: 42,
      user: "Ann Lee",
      activity: "Development",
      hours: 1.5,
      comments: "Fix bug",
      spent_on: "2026-10-28",
    },
  ]);
});

test("update_time_entry sends only the given fields", async () => {
  const { call, requests } = await setup({ "PUT /time_entries/100.json": null });

  const text = await call("update_time_entry", { id: 100, hours: 2, comments: "Fixed" });

  const [req] = requests("PUT", "/time_entries/100.json");
  assert.deepEqual(JSON.parse(req.body), {
    time_entry: { hours: 2, comments: "Fixed" },
  });
  assert.match(text, /#100/);
});

test("update_time_entry with no fields returns an error and makes no request", async () => {
  const { call, calls } = await setup();

  const text = await call("update_time_entry", { id: 100 });

  assert.match(text, /^Error: /);
  assert.equal(calls.length, 0);
});

test("delete_time_entry issues DELETE", async () => {
  const { call, requests } = await setup({ "DELETE /time_entries/100.json": null });

  const text = await call("delete_time_entry", { id: 100 });

  const [req] = requests("DELETE", "/time_entries/100.json");
  assert.ok(req, "expected DELETE /time_entries/100.json");
  assert.equal(req.headers["X-Redmine-API-Key"], "test-key");
  assert.match(text, /#100/);
});
