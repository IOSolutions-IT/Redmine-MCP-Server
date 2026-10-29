// Shared test harness: boots a fresh server instance over an in-memory MCP
// transport and replaces globalThis.fetch with a route table that records calls.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

process.env.REDMINE_URL = "https://redmine.test";
process.env.REDMINE_API_KEY = "test-key";
process.env.REDMINE_USER_ID = "7";

const DEFAULT_ROUTES = {
  "GET /users/7.json": {
    user: { id: 7, login: "ann", firstname: "Ann", lastname: "Lee" },
  },
};

export const ACTIVITIES = {
  time_entry_activities: [
    { id: 8, name: "Design", is_default: false },
    { id: 9, name: "Development", is_default: true },
  ],
};

let instance = 0;

/**
 * @param {Record<string, object | ((req: {url: URL, init: object}) => object)>} routes
 *   keyed by "METHOD /path" (query string excluded)
 */
export async function setup(routes = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const method = init.method || "GET";
    calls.push({ url: parsed, method, headers: init.headers || {}, body: init.body });
    const key = `${method} ${parsed.pathname}`;
    const handler = key in routes ? routes[key] : DEFAULT_ROUTES[key];
    if (handler === undefined) {
      return new Response(`no route for ${key}`, { status: 404 });
    }
    const payload =
      typeof handler === "function" ? handler({ url: parsed, init }) : handler;
    return new Response(payload === null ? "" : JSON.stringify(payload), {
      status: 200,
    });
  };

  // A unique query string yields a fresh module instance (new server, timers, cache).
  const mod = await import(`../index.js?instance=${++instance}`);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await mod.server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);

  const call = async (name, args = {}) => {
    const res = await client.callTool({ name, arguments: args });
    return res.content[0].text;
  };

  const requests = (method, pathname) =>
    calls.filter((c) => c.method === method && c.url.pathname === pathname);

  return { calls, call, requests, client, mod };
}
