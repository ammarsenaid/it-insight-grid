#!/usr/bin/env node
import fs from "node:fs";

const ENV_FILE = ".env.local";

function loadEnvFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

async function readJson(response, label) {
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${label} did not return JSON: ${text.slice(0, 1000)}`);
  }

  if (!response.ok) {
    throw new Error(`${label} failed: ${JSON.stringify(data, null, 2)}`);
  }

  return data;
}

async function getGraphToken({ tenantId, clientId, clientSecret }) {
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("scope", "https://graph.microsoft.com/.default");
  body.set("grant_type", "client_credentials");

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  const data = await readJson(response, "Microsoft token request");
  if (!data.access_token) throw new Error("Microsoft token response had no access_token");
  return data.access_token;
}

async function listInboxMessages({ accessToken, mailbox, limit, sinceIso }) {
  const url = new URL(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      mailbox,
    )}/mailFolders/inbox/messages`,
  );

  url.searchParams.set("$top", String(limit));
  url.searchParams.set(
    "$select",
    "id,internetMessageId,subject,from,receivedDateTime,isRead,bodyPreview",
  );
  url.searchParams.set("$orderby", "receivedDateTime desc");

  if (sinceIso) {
    url.searchParams.set("$filter", `receivedDateTime ge ${sinceIso}`);
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await readJson(response, "Microsoft Graph inbox read");
  return Array.isArray(data.value) ? data.value : [];
}

async function processMessage({ supabaseUrl, serviceRoleKey, mailbox, message }) {
  const from = message.from?.emailAddress ?? {};
  const fromEmail = from.address || "unknown@example.invalid";
  const fromName = from.name || null;
  const providerMessageId = message.internetMessageId || message.id;
  const subject = message.subject || "(no subject)";
  const bodyPreview = message.bodyPreview || "";
  const receivedAt = message.receivedDateTime || new Date().toISOString();

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/process_microsoft_graph_mail`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_mailbox_address: mailbox,
      p_provider_message_id: providerMessageId,
      p_from_email: fromEmail,
      p_from_name: fromName,
      p_subject: subject,
      p_body_preview: bodyPreview,
      p_received_at: receivedAt,
    }),
  });

  const data = await readJson(response, "Supabase process_microsoft_graph_mail RPC");
  const row = Array.isArray(data) ? data[0] : data;

  return {
    providerMessageId,
    fromEmail,
    subject,
    ticketNumber: row?.ticket_number ?? null,
    wasDuplicate: Boolean(row?.was_duplicate),
  };
}

async function main() {
  loadEnvFile(ENV_FILE);

  const tenantId = required("MICROSOFT_TENANT_ID");
  const clientId = required("MICROSOFT_CLIENT_ID");
  const clientSecret = required("MICROSOFT_CLIENT_SECRET");
  const mailbox = required("ITKC_MAIL_INTAKE_MAILBOX").toLowerCase();
  const supabaseUrl = required("VITE_SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const limit = Number(process.env.ITKC_MAIL_INTAKE_LIMIT || "10");
  const sinceIso = process.env.ITKC_MAIL_INTAKE_SINCE_ISO?.trim() || null;

  console.log(`Mailbox: ${mailbox}`);
  console.log(`Since: ${sinceIso || "not set"}`);
  console.log(`Limit: ${limit}`);

  const accessToken = await getGraphToken({ tenantId, clientId, clientSecret });
  const messages = await listInboxMessages({ accessToken, mailbox, limit, sinceIso });

  console.log(`Graph messages returned: ${messages.length}`);

  const oldestFirst = [...messages].reverse();

  for (const message of oldestFirst) {
    const result = await processMessage({ supabaseUrl, serviceRoleKey, mailbox, message });
    console.log(
      `${result.wasDuplicate ? "DUPLICATE" : "CREATED"} | ${result.ticketNumber} | ${result.fromEmail} | ${result.subject}`,
    );
  }
}

main().catch((err) => {
  console.error("Microsoft Graph mail intake failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
