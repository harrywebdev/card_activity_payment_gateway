import "server-only";
import { BRAND_NAME, env } from "@/lib/config";

/**
 * Thin Mailgun HTTP-API wrapper. No SDK — the API is just an authenticated
 * POST to `{base}/v3/{domain}/messages` with form-encoded body.
 *
 *   docs: https://documentation.mailgun.com/docs/mailgun/api-reference/openapi-final/tag/Messages
 *
 * Region picks the base URL: "eu" → api.eu.mailgun.net, "us" → api.mailgun.net.
 * Free tier sandbox domains can only deliver to verified recipients; once you
 * verify a real domain in Mailgun you can switch MAILGUN_FROM + MAILGUN_DOMAIN
 * to it.
 */
const MAILGUN_BASE_URL = {
  eu: "https://api.eu.mailgun.net",
  us: "https://api.mailgun.net",
} as const;

export async function sendMagicLink(to: string, link: string) {
  if (env.DRY_RUN) {
    console.log(`[DRY_RUN] magic link for ${to}: ${link}`);
    return;
  }

  const base = MAILGUN_BASE_URL[env.MAILGUN_REGION];
  const url = `${base}/v3/${env.MAILGUN_DOMAIN}/messages`;
  const auth =
    "Basic " + Buffer.from(`api:${env.MAILGUN_API_KEY}`).toString("base64");

  const body = new URLSearchParams();
  body.set("from", env.MAILGUN_FROM);
  body.set("to", to);
  body.set("subject", `${BRAND_NAME} — přihlášení`);
  body.set(
    "text",
    [
      `Klikni na odkaz pro přihlášení do ${BRAND_NAME}:`,
      "",
      link,
      "",
      "Odkaz platí 15 minut a je jednorázový.",
      "",
      "Pokud jsi o přihlášení nežádal/a, tento e-mail můžeš ignorovat.",
    ].join("\n"),
  );
  body.set(
    "html",
    `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; line-height: 1.5;">
        <h1 style="font-size: 20px;">${BRAND_NAME}</h1>
        <p>Klikni níže pro přihlášení. Odkaz platí 15 minut a je jednorázový.</p>
        <p>
          <a href="${link}"
             style="display: inline-block; padding: 10px 16px; background: #111; color: #fff; text-decoration: none; border-radius: 6px;">
            Přihlásit se
          </a>
        </p>
        <p style="color: #666; font-size: 12px;">Pokud jsi o přihlášení nežádal/a, tento e-mail můžeš ignorovat.</p>
      </div>
    `,
  );

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Mailgun API error: ${res.status} ${errBody}`);
  }
}
