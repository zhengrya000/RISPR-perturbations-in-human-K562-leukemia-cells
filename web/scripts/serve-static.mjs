import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const root = resolve("out");
const prefix = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
const port = Number(process.env.PORT || 3017);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

try {
  await stat(resolve(root, "index.html"));
} catch {
  console.error("Build first with npm run build; the out/index.html file is missing.");
  process.exit(1);
}

createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405).end();
    return;
  }
  try {
    let pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (prefix && pathname !== prefix && !pathname.startsWith(`${prefix}/`)) {
      response.writeHead(404).end("Not found");
      return;
    }
    pathname = pathname.slice(prefix.length);
    let filename = resolve(root, `.${pathname || "/"}`);
    if (filename !== root && !filename.startsWith(`${root}${sep}`)) {
      response.writeHead(404).end("Not found");
      return;
    }
    if ((await stat(filename)).isDirectory()) filename = resolve(filename, "index.html");
    const body = await readFile(filename);
    response.writeHead(200, { "Content-Type": contentTypes[extname(filename)] || "application/octet-stream" });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Static dashboard: http://127.0.0.1:${port}${prefix}/`);
});
