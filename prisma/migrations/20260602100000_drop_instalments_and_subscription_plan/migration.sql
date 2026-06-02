-- Collapse the per-month "split into N instalments" model into a single
-- monthly charge. Drops Subscription.instalmentsPerMonth, removes the
-- SubscriptionPlan table, and re-parents ScheduledPayment onto Subscription
-- with a (year, month) coordinate.
--
-- This change is driven by GoPay compliance: the gateway does not permit
-- payments framed as splátky (instalments), only a single recurring monthly
-- charge that the customer can cancel at any time.

PRAGMA foreign_keys=OFF;

-- ── ScheduledPayment: re-parent from SubscriptionPlan to Subscription ──
CREATE TABLE "new_ScheduledPayment" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "year"           INTEGER NOT NULL,
    "month"          INTEGER NOT NULL,
    "amountCzk"      INTEGER NOT NULL,
    "scheduledAt"    DATETIME NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'pending',
    "attempts"       INTEGER NOT NULL DEFAULT 0,
    "lastError"      TEXT,
    CONSTRAINT "ScheduledPayment_subscriptionId_fkey"
        FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_ScheduledPayment" (
    "id", "subscriptionId", "year", "month", "amountCzk",
    "scheduledAt", "status", "attempts", "lastError"
)
SELECT
    sp."id",
    plan."subscriptionId",
    plan."year",
    plan."month",
    sp."amountCzk",
    sp."scheduledAt",
    sp."status",
    sp."attempts",
    sp."lastError"
FROM "ScheduledPayment" sp
JOIN "SubscriptionPlan" plan ON plan."id" = sp."subscriptionPlanId";

DROP TABLE "ScheduledPayment";
ALTER TABLE "new_ScheduledPayment" RENAME TO "ScheduledPayment";

CREATE UNIQUE INDEX "ScheduledPayment_subscriptionId_year_month_key"
    ON "ScheduledPayment"("subscriptionId", "year", "month");
CREATE INDEX "ScheduledPayment_scheduledAt_status_idx"
    ON "ScheduledPayment"("scheduledAt", "status");
CREATE INDEX "ScheduledPayment_year_month_idx"
    ON "ScheduledPayment"("year", "month");

-- ── Drop the now-empty SubscriptionPlan table ──
DROP TABLE "SubscriptionPlan";

-- ── Subscription: drop the instalmentsPerMonth column ──
CREATE TABLE "new_Subscription" (
    "id"                    TEXT NOT NULL PRIMARY KEY,
    "userId"                TEXT NOT NULL,
    "colorId"               TEXT NOT NULL,
    "paymentMethodId"       TEXT,
    "monthlyAmountCzk"      INTEGER NOT NULL,
    "status"                TEXT NOT NULL DEFAULT 'pending',
    "initialGopayPaymentId" TEXT,
    "startedAt"             DATETIME,
    "cancelledAt"           DATETIME,
    "createdAt"             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subscription_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_colorId_fkey"
        FOREIGN KEY ("colorId") REFERENCES "Color" ("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_paymentMethodId_fkey"
        FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Subscription" (
    "id", "userId", "colorId", "paymentMethodId", "monthlyAmountCzk",
    "status", "initialGopayPaymentId", "startedAt", "cancelledAt", "createdAt"
)
SELECT
    "id", "userId", "colorId", "paymentMethodId", "monthlyAmountCzk",
    "status", "initialGopayPaymentId", "startedAt", "cancelledAt", "createdAt"
FROM "Subscription";

DROP TABLE "Subscription";
ALTER TABLE "new_Subscription" RENAME TO "Subscription";

CREATE UNIQUE INDEX "Subscription_initialGopayPaymentId_key"
    ON "Subscription"("initialGopayPaymentId");
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
CREATE INDEX "Subscription_colorId_idx" ON "Subscription"("colorId");
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

PRAGMA foreign_keys=ON;
