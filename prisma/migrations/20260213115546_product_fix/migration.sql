/*
  Warnings:

  - A unique constraint covering the columns `[productId,sku]` on the table `ProductVariant` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "stock" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_sku_key" ON "ProductVariant"("productId", "sku");
