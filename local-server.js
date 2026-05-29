const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const enquiryHandler = require("./api/enquiries");

const PORT = process.env.PORT || 5177;
const rootDir = __dirname;
const envFile = path.join(rootDir, ".env");

loadEnvFile();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function loadEnvFile() {
  if (!fs.existsSync(envFile)) {
    return;
  }

  const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
  });
}

function createApiResponse(response) {
  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };
  response.json = (payload) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(payload));
  };
  return response;
}

function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const cleanPath = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
  const filePath = path.normalize(path.join(rootDir, cleanPath));

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/api/enquiries") {
    try {
      request.body = await parseRequestBody(request);
      await enquiryHandler(request, createApiResponse(response));
    } catch (error) {
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: false, message: error.message || "Something went wrong." }));
    }
    return;
  }

  if (request.method === "GET") {
    serveStatic(request, response);
    return;
  }

  response.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ ok: false, message: "Method not allowed." }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`NCLIPS marketing site running at http://127.0.0.1:${PORT}`);
});
