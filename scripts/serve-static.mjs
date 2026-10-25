// Minimal static server for the exported Next.js app (Cloudflare Pages output).
// Usage: npm run start   (serves ./out on $PORT or 3000)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "out");
const port = Number(process.env.PORT ?? 3000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  let p = normalize(decoded);
  if (p.startsWith("/")) p = p.slice(1);
  return join(root, p);
}

async function tryFile(p) {
  try {
    const s = await stat(p);
    if (s.isFile()) return p;
  } catch {
    /* not found */
  }
  return null;
}

createServer(async (req, res) => {
  try {
    let p = safePath(req.url ?? "/");
    let file = await tryFile(p);
    // SPA fallback: serve /404.html for unknown paths (Pages does the same);
    // html pages are pre-rendered, so only deep links need this.
    if (!file) {
      const asHtml = await tryFile(p + ".html");
      file = asHtml ?? (await tryFile(join(root, "404.html")));
    }
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const data = await readFile(file);
    const type = MIME[extname(file)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    res.end(data);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(`Internal error: ${err?.message ?? String(err)}`);
  }
}).listen(port, () => {
  console.log(`Serving ${root} on http://localhost:${port}`);
});
