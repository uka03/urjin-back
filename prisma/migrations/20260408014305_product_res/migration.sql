/*
  Warnings:

  - You are about to drop the column `description` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the `ProductVariant` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[itemCode]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `categoryId` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `itemCode` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `minStock` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unit` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_productId_fkey";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "description",
DROP COLUMN "isActive",
DROP COLUMN "price",
DROP COLUMN "title",
DROP COLUMN "updatedAt",
ADD COLUMN     "categoryId" TEXT NOT NULL,
ADD COLUMN     "images" TEXT[],
ADD COLUMN     "itemCode" TEXT NOT NULL,
ADD COLUMN     "minStock" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "unit" TEXT NOT NULL,
ALTER COLUMN "stock" SET DEFAULT 0,
ALTER COLUMN "stock" SET DATA TYPE DOUBLE PRECISION;

-- DropTable
DROP TABLE "ProductVariant";

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_itemCode_key" ON "Product"("itemCode");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
