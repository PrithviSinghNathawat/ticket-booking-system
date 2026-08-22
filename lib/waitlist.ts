import { randomBytes } from "crypto";
import type { Prisma, WaitlistEntry, WaitlistOffer } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { activeAllocationWhere, expiredHoldWhere } from "@/lib/allocations";
import { WAITLIST_OFFER_TTL_SECONDS } from "@/lib/config";

const MAX_CASCADE_ITERATIONS = 20;

type TxClient = Prisma.TransactionClient;

export type OfferHandoff = {
  entry: WaitlistEntry;
  offer: WaitlistOffer;
  seatId: string;
};

export async function offerSeatToNextWaiter(
  tx: TxClient,
  params: { showId: string; categoryId: string; seatId: string; now: Date }
): Promise<OfferHandoff | null> {
  const entry = await tx.waitlistEntry.findFirst({
    where: { showId: params.showId, categoryId: params.categoryId, status: "WAITING" },
    orderBy: { createdAt: "asc" },
  });
  if (!entry) return null;

  const guarded = await tx.waitlistEntry.updateMany({
    where: { id: entry.id, status: "WAITING" },
    data: { status: "OFFERED" },
  });
  if (guarded.count !== 1) return null;

  const expiresAt = new Date(params.now.getTime() + WAITLIST_OFFER_TTL_SECONDS * 1000);
  const token = randomBytes(32).toString("hex");

  const offer = await tx.waitlistOffer.create({
    data: {
      waitlistEntryId: entry.id,
      seatId: params.seatId,
      token,
      expiresAt,
      status: "PENDING",
    },
  });

  await tx.seatAllocation.create({
    data: {
      showId: params.showId,
      seatId: params.seatId,
      status: "HELD",
      holderUserId: entry.userId,
      expiresAt,
    },
  });

  return { entry, offer, seatId: params.seatId };
}

export type FreedSeat = { seatId: string; categoryId: string };

export type BatchOfferResult = {
  entry: WaitlistEntry;
  seatId: string;
  token: string;
  expiresAt: Date;
}[];

export async function offerFreedSeatsBatch(
  tx: TxClient,
  params: { showId: string; freed: FreedSeat[]; now: Date; strict?: boolean }
): Promise<BatchOfferResult | null> {
  if (params.freed.length === 0) return [];

  const seatIdsByCategory = new Map<string, string[]>();
  for (const f of params.freed) {
    const list = seatIdsByCategory.get(f.categoryId) ?? [];
    list.push(f.seatId);
    seatIdsByCategory.set(f.categoryId, list);
  }
  const categoryIds = Array.from(seatIdsByCategory.keys());

  const candidates = await tx.waitlistEntry.findMany({
    where: { showId: params.showId, categoryId: { in: categoryIds }, status: "WAITING" },
    orderBy: [{ categoryId: "asc" }, { createdAt: "asc" }],
  });

  const candidatesByCategory = new Map<string, WaitlistEntry[]>();
  for (const c of candidates) {
    const list = candidatesByCategory.get(c.categoryId) ?? [];
    list.push(c);
    candidatesByCategory.set(c.categoryId, list);
  }

  const pairs: { entry: WaitlistEntry; seatId: string }[] = [];
  for (const [categoryId, seatIds] of seatIdsByCategory) {
    const entries = candidatesByCategory.get(categoryId) ?? [];
    const n = Math.min(entries.length, seatIds.length);
    for (let i = 0; i < n; i++) {
      pairs.push({ entry: entries[i], seatId: seatIds[i] });
    }
  }

  if (pairs.length === 0) return [];

  const entryIds = pairs.map((p) => p.entry.id);
  const guarded = await tx.waitlistEntry.updateMany({
    where: { id: { in: entryIds }, status: "WAITING" },
    data: { status: "OFFERED" },
  });

  let finalPairs = pairs;
  if (guarded.count !== entryIds.length) {
    if (params.strict !== false) {
      return null;
    }
    const succeeded = await tx.waitlistEntry.findMany({
      where: { id: { in: entryIds }, status: "OFFERED" },
      select: { id: true },
    });
    const succeededIds = new Set(succeeded.map((s) => s.id));
    finalPairs = pairs.filter((p) => succeededIds.has(p.entry.id));
  }

  if (finalPairs.length === 0) return [];

  const expiresAt = new Date(params.now.getTime() + WAITLIST_OFFER_TTL_SECONDS * 1000);
  const prepared = finalPairs.map((p) => ({
    entry: p.entry,
    seatId: p.seatId,
    token: randomBytes(32).toString("hex"),
  }));

  await tx.waitlistOffer.createMany({
    data: prepared.map((p) => ({
      waitlistEntryId: p.entry.id,
      seatId: p.seatId,
      token: p.token,
      expiresAt,
      status: "PENDING" as const,
    })),
  });

  await tx.seatAllocation.createMany({
    data: prepared.map((p) => ({
      showId: params.showId,
      seatId: p.seatId,
      status: "HELD" as const,
      holderUserId: p.entry.userId,
      expiresAt,
    })),
  });

  return prepared.map((p) => ({ entry: p.entry, seatId: p.seatId, token: p.token, expiresAt }));
}

async function expireOneOfferForShow(showId: string, now: Date) {
  return prisma.$transaction(async (tx) => {
    const offer = await tx.waitlistOffer.findFirst({
      where: { status: "PENDING", expiresAt: { lte: now }, waitlistEntry: { showId } },
      orderBy: { expiresAt: "asc" },
      include: { waitlistEntry: true },
    });
    if (!offer) return null;

    const guarded = await tx.waitlistOffer.updateMany({
      where: { id: offer.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    if (guarded.count !== 1) return null;

    await tx.waitlistEntry.update({
      where: { id: offer.waitlistEntryId },
      data: { status: "EXPIRED" },
    });

    await tx.seatAllocation.deleteMany({
      where: {
        showId,
        seatId: offer.seatId,
        holderUserId: offer.waitlistEntry.userId,
        status: "HELD",
      },
    });

    return { categoryId: offer.waitlistEntry.categoryId, seatId: offer.seatId };
  });
}

async function offerNextFreeSeatInCategory(showId: string, categoryId: string, now: Date) {
  return prisma.$transaction(async (tx) => {
    const seatsInCategory = await tx.seat.findMany({ where: { categoryId }, select: { id: true } });
    const seatIds = seatsInCategory.map((s) => s.id);
    if (seatIds.length === 0) return null;

    const activeAllocations = await tx.seatAllocation.findMany({
      where: { showId, seatId: { in: seatIds }, ...activeAllocationWhere(now) },
      select: { seatId: true },
    });
    const takenSeatIds = new Set(activeAllocations.map((a) => a.seatId));
    const freeSeatId = seatIds.find((id) => !takenSeatIds.has(id));
    if (!freeSeatId) return null;

    await tx.seatAllocation.deleteMany({
      where: { showId, seatId: freeSeatId, ...expiredHoldWhere(now) },
    });

    return offerSeatToNextWaiter(tx, { showId, categoryId, seatId: freeSeatId, now });
  });
}

export async function processWaitlist(
  showId: string
): Promise<{ expiredOffers: number; promotedWaitlistEntries: number }> {
  let expiredOffers = 0;
  let promotedWaitlistEntries = 0;

  for (let i = 0; i < MAX_CASCADE_ITERATIONS; i++) {
    const now = new Date();
    const expired = await expireOneOfferForShow(showId, now);
    if (!expired) break;
    expiredOffers++;

    const promoted = await prisma.$transaction((tx) =>
      offerSeatToNextWaiter(tx, {
        showId,
        categoryId: expired.categoryId,
        seatId: expired.seatId,
        now: new Date(),
      })
    );
    if (promoted) promotedWaitlistEntries++;
  }

  const waitingCategories = await prisma.waitlistEntry.findMany({
    where: { showId, status: "WAITING" },
    select: { categoryId: true },
    distinct: ["categoryId"],
  });

  for (const { categoryId } of waitingCategories) {
    for (let i = 0; i < MAX_CASCADE_ITERATIONS; i++) {
      const now = new Date();
      const promoted = await offerNextFreeSeatInCategory(showId, categoryId, now);
      if (!promoted) break;
      promotedWaitlistEntries++;
    }
  }

  return { expiredOffers, promotedWaitlistEntries };
}

export async function processWaitlistForAllActiveShows(): Promise<{
  expiredOffers: number;
  promotedWaitlistEntries: number;
}> {
  const [entryShowIds, offerShowIds] = await Promise.all([
    prisma.waitlistEntry.findMany({
      where: { status: { in: ["WAITING", "OFFERED"] } },
      select: { showId: true },
      distinct: ["showId"],
    }),
    prisma.waitlistOffer.findMany({
      where: { status: "PENDING" },
      select: { waitlistEntry: { select: { showId: true } } },
      distinct: ["waitlistEntryId"],
    }),
  ]);

  const showIds = new Set<string>();
  for (const e of entryShowIds) showIds.add(e.showId);
  for (const o of offerShowIds) showIds.add(o.waitlistEntry.showId);

  let expiredOffers = 0;
  let promotedWaitlistEntries = 0;

  for (const showId of showIds) {
    const result = await processWaitlist(showId);
    expiredOffers += result.expiredOffers;
    promotedWaitlistEntries += result.promotedWaitlistEntries;
  }

  return { expiredOffers, promotedWaitlistEntries };
}
