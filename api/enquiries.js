const crypto = require("node:crypto");
const nodemailer = require("nodemailer");

function sendJson(response, statusCode, payload) {
  response.status(statusCode).json(payload);
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

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { ok: false, message: "Method not allowed." });
    return;
  }

  try {
    const payload = request.body || {};

    if (!isValidEnquiry(payload)) {
      sendJson(response, 400, { ok: false, message: "Please complete all required fields." });
      return;
    }

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
    const emailResult = await sendEnquiryEmail(enquiry);

    sendJson(response, 201, {
      ok: true,
      message: emailResult.sent
        ? "Thanks. Your enquiry has been submitted successfully. Our team has been notified."
        : "Thanks. Your enquiry has been submitted successfully. Email notification is not configured yet.",
      enquiryId: enquiry.id,
      emailSent: emailResult.sent,
      emailMessage: emailResult.reason || "Email sent to company inbox.",
    });
  } catch (error) {
    sendJson(response, 500, { ok: false, message: error.message || "Something went wrong." });
  }
};
