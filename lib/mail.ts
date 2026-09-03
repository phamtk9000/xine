import "server-only";

/**
 * Outbound email, with a provider if there is one and the log if not.
 *
 * One HTTP call to Resend rather than an SMTP client and a transport config:
 * Resend's free tier sends three thousand a month, which is more than this
 * site will need for a long time, and a plain `fetch` keeps the dependency
 * list where it is. Nothing here is Resend-specific except the twenty lines
 * inside `deliver` — swapping in Postmark or SES is that function.
 *
 * When no key is set, mail is written to the server log instead of being
 * dropped. That is not a placeholder: it is how local development works, and
 * it means a misconfigured production deployment leaves a trail saying
 * exactly which link never went out, rather than a member sitting in front
 * of an empty inbox with nothing to show for it.
 */

export type Mail = {
  to: string;
  subject: string;
  /** Plain text is the message. HTML, if any, is a nicety on top of it. */
  text: string;
  html?: string;
};

export type MailResult = { delivered: boolean; error?: string };

export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * The origin to put in links that arrive by email.
 *
 * A relative URL is no use in an inbox, and `headers()` cannot be trusted
 * for this — a Host header is attacker-controlled, and a verification link
 * built from one is a way to have the site mail somebody a link to a server
 * that is not the site. So it comes from configuration, and falls back to
 * the deployment's own domain, which Vercel sets.
 */
export function siteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

const FROM = process.env.MAIL_FROM ?? "xine <onboarding@resend.dev>";

export async function sendMail(mail: Mail): Promise<MailResult> {
  if (!mailConfigured()) {
    console.info(
      `[mail] no RESEND_API_KEY — not sent.\n  to: ${mail.to}\n  subject: ${mail.subject}\n${mail.text}`,
    );
    return { delivered: false, error: "Mail is not configured on this server" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        ...(mail.html ? { html: mail.html } : {}),
      }),
    });

    if (!response.ok) {
      // Their body says useful things — an unverified sending domain, a
      // recipient the free tier will not accept — and none of it is secret.
      const body = await response.text();
      console.error(`[mail] resend ${response.status}: ${body.slice(0, 300)}`);
      return { delivered: false, error: `Mail provider said ${response.status}` };
    }

    return { delivered: true };
  } catch (error) {
    console.error("[mail] send failed", error);
    return { delivered: false, error: "Could not reach the mail provider" };
  }
}
