import "server-only";
import { Resend } from "resend";
import { BRAND_NAME, env } from "@/lib/config";

const resend = new Resend(env.RESEND_API_KEY);

const FROM = `${BRAND_NAME} <noreply@kupsiodstin.cz>`;

export async function sendMagicLink(to: string, link: string) {
  if (env.DRY_RUN) {
    console.log(`[DRY_RUN] magic link for ${to}: ${link}`);
    return;
  }

  await resend.emails.send({
    from: FROM,
    to,
    subject: `${BRAND_NAME} — přihlášení`,
    html: `
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
  });
}
