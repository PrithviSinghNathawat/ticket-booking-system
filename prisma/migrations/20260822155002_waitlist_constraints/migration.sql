-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_showId_categoryId_userId_key" ON "WaitlistEntry"("showId", "categoryId", "userId");

-- AddForeignKey
ALTER TABLE "WaitlistOffer" ADD CONSTRAINT "WaitlistOffer_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
