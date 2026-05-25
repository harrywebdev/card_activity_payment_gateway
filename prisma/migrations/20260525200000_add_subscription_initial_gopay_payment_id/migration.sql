-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "initialGopayPaymentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_initialGopayPaymentId_key" ON "Subscription"("initialGopayPaymentId");
