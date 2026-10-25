// Thin typed wrapper around the Resend API.
const RESEND_API_URL = "https://api.resend.com/emails";

export interface ResendEmail {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}

export async function sendEmail(email: ResendEmail, apiKey: string): Promise<void> {
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(email),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}