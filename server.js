const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const nodemailer = require("nodemailer");

const PORT = process.env.PORT || 5177;
const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const enquiriesFile = path.join(dataDir, "enquiries.json");
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

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(enquiriesFile)) {
    fs.writeFileSync(enquiriesFile, "[]\n", "utf8");
  }
}

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

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
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

function isValidEnquiry(payload) {
  return Boolean(
    payload &&
      typeof payload.name === "string" &&
      typeof payload.email === "string" &&
      typeof payload.phone === "string" &&
      typeof payload.status === "string" &&
      payload.name.trim() &&
      payload.email.includes("@") &&
      payload.phone.trim() &&
      payload.status.trim()
  );
}

function getRequiredMailConfig() {
  const requiredKeys = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "COMPANY_EMAIL"];
  const missingKeys = requiredKeys.filter((key) => !process.env[key]);

  if (missingKeys.length > 0) {
    return { ok: false, missingKeys };
  }

  return {
    ok: true,
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || "true").toLowerCase() === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    to: process.env.COMPANY_EMAIL,
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildEnquiryEmail(enquiry) {
  const fields = [
    ["Name", enquiry.name],
    ["Email", enquiry.email],
    ["Phone", enquiry.phone],
    ["Current Status", enquiry.status],
    ["Interested In", enquiry.interest || "Not specified"],
    ["Message", enquiry.message || "No message added"],
    ["Submitted At", enquiry.createdAt],
    ["Enquiry ID", enquiry.id],
  ];

  const text = fields.map(([label, value]) => `${label}: ${value}`).join("\n");
  const rows = fields
    .map(
      ([label, value]) =>
        `<tr><th align="left" style="padding:8px 12px;background:#eef6ff;">${escapeHtml(label)}</th><td style="padding:8px 12px;">${escapeHtml(value)}</td></tr>`
    )
    .join("");

  return {
    subject: `New NCLIPS enquiry from ${enquiry.name}`,
    text,
    html: `
      <div style="font-family:Arial,sans-serif;color:#102033;line-height:1.5;">
        <h2>New NCLIPS student enquiry</h2>
        <table border="1" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-color:#d9e3ec;">
          ${rows}
        </table>
      </div>
    `,
  };
}

async function sendEnquiryEmail(enquiry) {
  const config = getRequiredMailConfig();

  if (!config.ok) {
    return {
      sent: false,
      reason: `Email not configured. Missing: ${config.missingKeys.join(", ")}`,
    };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
  const email = buildEnquiryEmail(enquiry);

  await transporter.sendMail({
    from: config.from,
    to: config.to,
    replyTo: enquiry.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  return { sent: true };
}

async function handleEnquiry(request, response) {
  try {
    const payload = await parseRequestBody(request);

    if (!isValidEnquiry(payload)) {
      sendJson(response, 400, { ok: false, message: "Please complete all required fields." });
      return;
    }

    ensureDataFile();

    const enquiries = JSON.parse(fs.readFileSync(enquiriesFile, "utf8"));
    const enquiry = {
      id: crypto.randomUUID(),
      name: payload.name.trim(),
      email: payload.email.trim(),
      phone: payload.phone.trim(),
      status: payload.status.trim(),
      interest: String(payload.interest || "").trim(),
      message: String(payload.message || "").trim(),
      createdAt: new Date().toISOString(),
    };

    enquiries.push(enquiry);
    fs.writeFileSync(enquiriesFile, `${JSON.stringify(enquiries, null, 2)}\n`, "utf8");

    const emailResult = await sendEnquiryEmail(enquiry);

    sendJson(response, 201, {
      ok: true,
      message: emailResult.sent
        ? "Thanks. Your enquiry has been submitted successfully. Our team has been notified."
        : "Thanks. Your enquiry has been saved successfully. Email notification is not configured yet.",
      enquiryId: enquiry.id,
      emailSent: emailResult.sent,
      emailMessage: emailResult.reason || "Email sent to company inbox.",
    });
  } catch (error) {
    sendJson(response, 500, { ok: false, message: error.message || "Something went wrong." });
  }
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

const server = http.createServer((request, response) => {
  if (request.method === "POST" && request.url === "/api/enquiries") {
    handleEnquiry(request, response);
    return;
  }

  if (request.method === "GET") {
    serveStatic(request, response);
    return;
  }

  sendJson(response, 405, { ok: false, message: "Method not allowed." });
});

ensureDataFile();

server.listen(PORT, "127.0.0.1", () => {
  console.log(`NCLIPS marketing site running at http://127.0.0.1:${PORT}`);
});
