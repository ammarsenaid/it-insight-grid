import fs from "node:fs";
import path from "node:path";

const host = process.env.ITKC_FRONTEND_HOST ?? "127.0.0.1";
const port = Number(process.env.ITKC_FRONTEND_PORT ?? "3000");

const appDir = "/opt/it-knowledge-center/app";
const clientDir = path.resolve(appDir, "dist/client");
const serverEntry = path.resolve(appDir, "dist/server/server.js");

if (
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535
) {
  throw new Error("Invalid ITKC frontend port.");
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".js" || ext === ".mjs") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".woff") return "font/woff";
  if (ext === ".woff2") return "font/woff2";
  if (ext === ".ttf") return "font/ttf";
  if (ext === ".map") return "application/json; charset=utf-8";

  return "application/octet-stream";
}

function resolveStaticAsset(url) {
  const pathname = new URL(url).pathname;

  if (!pathname.startsWith("/assets/")) {
    return null;
  }

  let decodedPathname;

  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decodedPathname.includes("\0")) {
    return null;
  }

  const relativePath = decodedPathname.replace(/^\/+/, "");
  const filePath = path.resolve(clientDir, relativePath);

  if (
    filePath !== clientDir &&
    !filePath.startsWith(clientDir + path.sep)
  ) {
    return null;
  }

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const stat = fs.statSync(filePath);

  if (!stat.isFile()) {
    return null;
  }

  return filePath;
}

const serverModule = await import(serverEntry);
const application = serverModule.default;

if (
  !application ||
  typeof application.fetch !== "function"
) {
  throw new Error(
    "Built frontend server does not export a default fetch handler.",
  );
}

const runtime = Bun.serve({
  hostname: host,
  port,
  fetch(request) {
    const staticAsset = resolveStaticAsset(request.url);

    if (staticAsset) {
      return new Response(
        Bun.file(staticAsset),
        {
          headers: {
            "Content-Type": contentTypeFor(staticAsset),
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        },
      );
    }

    return application.fetch(
      request,
      process.env,
      {
        waitUntil() {},
        passThroughOnException() {},
      },
    );
  },
});

function shutdown() {
  runtime.stop(true);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(
  `ITKC frontend listening on http://${host}:${port}`,
);
