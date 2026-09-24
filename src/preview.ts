import { spawn } from "node:child_process";
import { createServer, type ServerResponse } from "node:http";
import { exit } from "node:process";
import { setTimeout } from "node:timers/promises";

const PORT = 5555;
const ORIGIN = `http://localhost:${PORT}`;

export async function preview(rows: object[]) {
  const body = JSON.stringify(rows);
  for (let attempt = 0; ; attempt++) {
    try {
      await fetch(`${ORIGIN}/data`, { method: "POST", body });
      return;
    } catch (error) {
      if (attempt === 0) {
        spawn(
          process.execPath,
          ["--experimental-transform-types", import.meta.filename, "--server"],
          {
            detached: true,
            stdio: "ignore",
          },
        ).unref();
      }
      if (attempt >= 100) throw error;
      await setTimeout(50);
    }
  }
}

if (!process.argv.includes("--server")) exit(0);

const clients = new Set<ServerResponse>();
let data: string | undefined;
let exitTimer: NodeJS.Timeout | undefined;

const scheduleExit = () => {
  clearTimeout(exitTimer);
  if (clients.size === 0) exitTimer = globalThis.setTimeout(() => exit(0), 5_000);
};

const server = createServer((req, res) => {
  if (req.url === "/events") {
    clients.add(res);
    clearTimeout(exitTimer);
    req.on("close", () => {
      clients.delete(res);
      scheduleExit();
    });
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    res.write(`retry: 300\n\n`);
    if (data) res.write(`data: ${data}\n\n`);
  } else if (req.url === "/data" && req.method === "POST") {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      data = Buffer.concat(chunks).toString();
      for (const client of clients) client.write(`data: ${data}\n\n`);
      res.end();
    });
  } else {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(/* html */ `
            <!doctype html>
            <meta charset="utf-8">
            <title>Preview</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tabulator-tables@6/dist/css/tabulator_simple.min.css">
            <script src="https://cdn.jsdelivr.net/npm/tabulator-tables@6/dist/js/tabulator.min.js"></script>
            <style>html, body { margin: 0; height: 100%; font: 12px system-ui, sans-serif; }</style>
            <div id="table"></div>
            <script>
            let table;
            new EventSource("/events").onmessage = (e) => {
                const rows = JSON.parse(e.data);
                const columns = [...new Set(rows.flatMap(Object.keys))].map((field) => ({ title: field, field }));
                if (!table) {
                table = new Tabulator("#table", { data: rows, columns, height: "100%", layout: "fitData"});
                } else {
                const fields = columns.map((c) => c.field).join();
                if (fields !== table.getColumns().map((c) => c.getField()).join()) table.setColumns(columns);
                table.replaceData(rows);
                }
            };
            </script>`);
  }
});

await new Promise<void>((resolve) => server.listen(PORT, resolve));
await setTimeout(1000); // Открытая вкладка сама переподключится к /events
if (clients.size === 0) spawn("xdg-open", [ORIGIN], { detached: true, stdio: "ignore" }).unref();
scheduleExit();
