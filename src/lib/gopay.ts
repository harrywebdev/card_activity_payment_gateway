import "server-only";
import { env } from "@/lib/config";

/**
 * Thin typed wrapper around GoPay's REST API.
 *
 * Surface reverse-engineered from the official PHP SDK
 * (github.com/gopaycommunity/gopay-php-api) since GoPay's REST docs
 * are on doc.gopay.com behind a cert that WebFetch can't validate.
 *
 * - Base URLs:
 *   sandbox    https://gw.sandbox.gopay.com/api
 *   production https://gate.gopay.cz/api
 * - OAuth2 Client Credentials grant, scope "payment-all", Basic auth header.
 * - Amounts are in haléř (1/100 CZK). We convert at this module's boundary.
 * - Effective per-charge minimum is 1 CZK (100 haléř); GoPay's docs don't
 *   pin an explicit floor for card payments but card networks reject
 *   sub-koruna amounts in practice.
 * - Webhooks are unsigned by GoPay design — the contract is "we send you
 *   the payment id, you call getStatus to confirm". Handled by the route.
 *
 * Everything is no-ops in DRY_RUN mode so the subscribe flow can be
 * exercised end-to-end without real sandbox credentials.
 */

const SANDBOX_BASE = "https://gw.sandbox.gopay.com/api";
const PRODUCTION_BASE = "https://gate.gopay.cz/api";

export const gopayBaseUrl = env.GOPAY_SANDBOX ? SANDBOX_BASE : PRODUCTION_BASE;

// ─── OAuth2 token (cached) ──────────────────────────────────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const credentials = Buffer.from(
    `${env.GOPAY_CLIENT_ID}:${env.GOPAY_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch(`${gopayBaseUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials&scope=payment-all",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `GoPay OAuth2 failed: ${res.status} ${await res.text().catch(() => "")}`,
    );
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };

  return cachedToken.value;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function czkToHellers(czk: number): number {
  return Math.round(czk * 100);
}

export function hellersToCzk(hellers: number): number {
  return Math.round(hellers / 100);
}

async function authedFetch(
  path: string,
  init: RequestInit & { jsonBody?: unknown; formBody?: Record<string, string> },
): Promise<Response> {
  const token = await getAccessToken();

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");

  let body: BodyInit | undefined = init.body ?? undefined;
  if (init.jsonBody !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.jsonBody);
  } else if (init.formBody !== undefined) {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
    body = new URLSearchParams(init.formBody).toString();
  }

  return fetch(`${gopayBaseUrl}${path}`, {
    ...init,
    headers,
    body,
    cache: "no-store",
  });
}

// ─── Payment types ──────────────────────────────────────────────────────────

export type GoPayPaymentState =
  | "CREATED"
  | "PAYMENT_METHOD_CHOSEN"
  | "PAID"
  | "AUTHORIZED"
  | "CANCELED"
  | "TIMEOUTED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export type CreatePaymentResponse = {
  id: number;
  order_number: string;
  state: GoPayPaymentState;
  amount: number; // haléř
  currency: string;
  gw_url: string;
};

export type GetPaymentStatusResponse = {
  id: number;
  order_number: string;
  state: GoPayPaymentState;
  amount: number;
  currency: string;
  payment_instrument?: string;
  payer?: {
    payment_card?: {
      card_number?: string; // masked, e.g. "411111****1111"
      issuer_bank?: string;
    };
    contact?: { email?: string };
  };
  recurrence?: {
    recurrence_cycle: string;
    recurrence_state: string;
  };
};

export type CreatePaymentInput = {
  email: string;
  amountCzk: number; // we accept whole CZK at the boundary
  orderNumber: string;
  orderDescription: string;
  returnUrl: string;
  notificationUrl: string;
  /**
   * "ON_DEMAND" for the initial enrolment payment that will be reused for MIT.
   */
  recurrence: "ON_DEMAND";
  /** Far-future date — GoPay requires recurrence_date_to even for ON_DEMAND. */
  recurrenceDateTo?: string; // YYYY-MM-DD, defaults to 2099-12-31
};

// ─── Operations ─────────────────────────────────────────────────────────────

export async function createPayment(
  input: CreatePaymentInput,
): Promise<CreatePaymentResponse> {
  if (env.DRY_RUN) {
    const fakeId = Math.floor(Math.random() * 1_000_000_000);
    console.log(
      `[DRY_RUN] gopay.createPayment(${input.orderNumber}, ${input.amountCzk} CZK) → ${fakeId}`,
    );
    return {
      id: fakeId,
      order_number: input.orderNumber,
      state: "CREATED",
      amount: czkToHellers(input.amountCzk),
      currency: "CZK",
      gw_url: `https://example.invalid/dry-run/gw/${fakeId}`,
    };
  }

  const amountHellers = czkToHellers(input.amountCzk);

  const body = {
    payer: {
      default_payment_instrument: "PAYMENT_CARD",
      allowed_payment_instruments: ["PAYMENT_CARD"],
      contact: { email: input.email },
    },
    amount: amountHellers,
    currency: "CZK",
    order_number: input.orderNumber,
    order_description: input.orderDescription,
    items: [
      {
        name: input.orderDescription,
        amount: amountHellers,
        count: 1,
      },
    ],
    recurrence: {
      recurrence_cycle: input.recurrence,
      recurrence_date_to: input.recurrenceDateTo ?? "2099-12-31",
    },
    callback: {
      return_url: input.returnUrl,
      notification_url: input.notificationUrl,
    },
    target: {
      type: "ACCOUNT",
      goid: Number(env.GOPAY_MERCHANT_ID),
    },
    lang: "CS",
  };

  const res = await authedFetch("/payments/payment", {
    method: "POST",
    jsonBody: body,
  });

  if (!res.ok) {
    throw new Error(
      `GoPay createPayment failed: ${res.status} ${await res.text().catch(() => "")}`,
    );
  }

  return (await res.json()) as CreatePaymentResponse;
}

export async function getPaymentStatus(
  paymentId: string | number,
): Promise<GetPaymentStatusResponse> {
  if (env.DRY_RUN) {
    console.log(`[DRY_RUN] gopay.getPaymentStatus(${paymentId}) → PAID`);
    return {
      id: Number(paymentId),
      order_number: `dry-run-${paymentId}`,
      state: "PAID",
      amount: 1000,
      currency: "CZK",
      payer: { payment_card: { card_number: "411111****1111" } },
    };
  }

  const res = await authedFetch(`/payments/payment/${paymentId}`, {
    method: "GET",
  });

  if (!res.ok) {
    throw new Error(
      `GoPay getPaymentStatus failed: ${res.status} ${await res.text().catch(() => "")}`,
    );
  }

  return (await res.json()) as GetPaymentStatusResponse;
}

export type CreateRecurrenceInput = {
  amountCzk: number;
  orderNumber: string;
  orderDescription: string;
};

export async function createRecurrence(
  originalPaymentId: string | number,
  input: CreateRecurrenceInput,
): Promise<CreatePaymentResponse> {
  if (env.DRY_RUN) {
    const fakeId = Math.floor(Math.random() * 1_000_000_000);
    console.log(
      `[DRY_RUN] gopay.createRecurrence(${originalPaymentId} → ${fakeId}, ${input.amountCzk} CZK)`,
    );
    return {
      id: fakeId,
      order_number: input.orderNumber,
      state: "PAID",
      amount: czkToHellers(input.amountCzk),
      currency: "CZK",
      gw_url: "",
    };
  }

  const amountHellers = czkToHellers(input.amountCzk);

  const body = {
    amount: amountHellers,
    currency: "CZK",
    order_number: input.orderNumber,
    order_description: input.orderDescription,
    items: [
      { name: input.orderDescription, amount: amountHellers, count: 1 },
    ],
  };

  const res = await authedFetch(
    `/payments/payment/${originalPaymentId}/create-recurrence`,
    { method: "POST", jsonBody: body },
  );

  if (!res.ok) {
    throw new Error(
      `GoPay createRecurrence failed: ${res.status} ${await res.text().catch(() => "")}`,
    );
  }

  return (await res.json()) as CreatePaymentResponse;
}

export async function voidRecurrence(
  originalPaymentId: string | number,
): Promise<void> {
  if (env.DRY_RUN) {
    console.log(`[DRY_RUN] gopay.voidRecurrence(${originalPaymentId})`);
    return;
  }

  const res = await authedFetch(
    `/payments/payment/${originalPaymentId}/void-recurrence`,
    { method: "POST", formBody: {} },
  );

  if (!res.ok) {
    throw new Error(
      `GoPay voidRecurrence failed: ${res.status} ${await res.text().catch(() => "")}`,
    );
  }
}
