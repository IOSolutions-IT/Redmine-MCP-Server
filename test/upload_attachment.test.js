import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup } from "./harness.js";

const dir = mkdtempSync(join(tmpdir(), "redmine-mcp-test-"));

test("upload_attachment uploads bytes then attaches the token to the issue", async () => {
  const filePath = join(dir, "network.har");
  const bytes = Buffer.from('{"log":{}}');
  writeFileSync(filePath, bytes);

  const { call, requests } = await setup({
    "POST /uploads.json": { upload: { token: "7.abc" } },
    "PUT /issues/42.json": null,
  });

  const text = await call("upload_attachment", {
    issue_id: 42,
    file_path: filePath,
    description: "HAR capture",
  });

  const [upload] = requests("POST", "/uploads.json");
  assert.ok(upload, "expected POST /uploads.json");
  assert.equal(upload.url.searchParams.get("filename"), "network.har");
  assert.equal(upload.headers["Content-Type"], "application/octet-stream");
  assert.equal(upload.headers["X-Redmine-API-Key"], "test-key");
  assert.deepEqual(Buffer.from(upload.body), bytes);

  const [attach] = requests("PUT", "/issues/42.json");
  assert.ok(attach, "expected PUT /issues/42.json");
  assert.equal(attach.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(attach.body), {
    issue: {
      uploads: [
        {
          token: "7.abc",
          filename: "network.har",
          description: "HAR capture",
          content_type: "application/json",
        },
      ],
    },
  });
  assert.match(text, /#42/);
});

test("upload_attachment honors filename override and omits unknown content_type", async () => {
  const filePath = join(dir, "data.bin");
  writeFileSync(filePath, Buffer.from([1, 2, 3]));

  const { call, requests } = await setup({
    "POST /uploads.json": { upload: { token: "t1" } },
    "PUT /issues/5.json": null,
  });

  await call("upload_attachment", {
    issue_id: 5,
    file_path: filePath,
    filename: "renamed.xyz",
  });

  const [upload] = requests("POST", "/uploads.json");
  assert.equal(upload.url.searchParams.get("filename"), "renamed.xyz");
  const body = JSON.parse(requests("PUT", "/issues/5.json")[0].body);
  assert.deepEqual(body.issue.uploads, [{ token: "t1", filename: "renamed.xyz" }]);
});

test("upload_attachment reports a missing file without calling Redmine", async () => {
  const { call, calls } = await setup();
  const missing = join(dir, "does-not-exist.png");

  const text = await call("upload_attachment", { issue_id: 1, file_path: missing });

  assert.match(text, /^Error: File not found/);
  assert.ok(text.includes(missing));
  assert.equal(calls.length, 0);
});
