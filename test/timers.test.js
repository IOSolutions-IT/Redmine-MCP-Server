import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./harness.js";

test("cancel_timer discards a running timer without logging", async () => {
  const { call, calls } = await setup();
  await call("start_timer", { issue_id: 42 });

  const text = await call("cancel_timer", { issue_id: 42 });

  assert.match(text, /discarded/i);
  assert.match(text, /#42/);
  assert.equal(calls.filter((c) => c.method === "POST").length, 0);

  const stop = await call("stop_timer", { issue_id: 42, activity_id: 9 });
  assert.match(stop, /No active timer/);
});

test("cancel_timer without a timer reports it clearly", async () => {
  const { call, calls } = await setup();

  const text = await call("cancel_timer", { issue_id: 42 });

  assert.match(text, /No active timer found for issue #42/);
  assert.equal(calls.length, 0);
});

test("stop_timer logs the hours override instead of elapsed time", async () => {
  const { call, requests } = await setup({ "POST /time_entries.json": null });
  await call("start_timer", { issue_id: 42 });

  const text = await call("stop_timer", { issue_id: 42, hours: 1.25, activity_id: 9 });

  const [req] = requests("POST", "/time_entries.json");
  const entry = JSON.parse(req.body).time_entry;
  assert.equal(entry.hours, 1.25);
  assert.equal(entry.activity_id, 9);
  assert.match(text, /Logged 1\.25h/);

  const again = await call("stop_timer", { issue_id: 42, activity_id: 9 });
  assert.match(again, /No active timer/);
});

test("stop_timer rejects a non-positive hours override", async () => {
  const { client } = await setup();
  const res = await client.callTool({
    name: "stop_timer",
    arguments: { issue_id: 42, hours: 0 },
  });
  assert.equal(res.isError, true);
});
