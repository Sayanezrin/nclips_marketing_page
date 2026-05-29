# NCLIPS Marketing Landing Page

Standalone landing page for the NCLIPS NCLEX learning platform.

## Run locally

```bash
npm install
npm start
```

Then open:

```text
http://127.0.0.1:5177
```

The local server uses `local-server.js`. Vercel uses the serverless function in
`api/enquiries.js`.

## What it includes

- NCLEX-focused marketing hero section
- Chapter-wise learning description
- Practice questions, mock exams, and rationales section
- Student support and enquiry messaging
- Enquiry form with local JSON storage
- Email notification to the company inbox through SMTP
- Social media links for Instagram, Facebook, LinkedIn, and YouTube

Submitted enquiries are saved to:
When running locally without SMTP, submissions are handled by the local backend response.
On Vercel, enquiries are sent by email through the `api/enquiries.js` serverless function.

Before publishing, update the phone number, email address, and social media URLs in `index.html`.

## Email Setup

Copy `.env.example` to `.env`, then add the SMTP details from your email provider:

```text
COMPANY_EMAIL=your-company-email@example.com
MAIL_FROM="NCLIPS Enquiries <your-company-email@example.com>"
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-company-email@example.com
SMTP_PASS=your-email-app-password
```

For Gmail or Google Workspace, use an app password instead of your normal account password.

In Vercel, add the same values under Project Settings > Environment Variables, then redeploy.
