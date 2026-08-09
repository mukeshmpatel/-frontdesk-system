import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../infrastructure.js";

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  propertyId: z.string().uuid().optional(),
  correlationId: z.string().uuid().optional(),
});

export async function getGlobalLedgers(request: FastifyRequest, reply: FastifyReply) {
  const query = querySchema.parse(request.query);
  const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 86_400_000);
  const to = query.to ? new Date(query.to) : new Date();
  if (to <= from) return reply.code(400).send({
    error: { code: "INVALID_DATE_RANGE", message: "to must be later than from." },
  });
  const where = {
    tenantId: request.authUser.tenantId,
    createdAt: { gte: from, lte: to },
    ...(query.propertyId ? { propertyId: query.propertyId } : {}),
    ...(query.correlationId ? { correlationId: query.correlationId } : {}),
  };
  const [groups, ledgers] = await Promise.all([
    prisma.franchiseSettleLedger.groupBy({
      by: ["propertyId", "status"],
      where,
      _sum: {
        grossFolioAmount: true,
        corporateCut: true,
        marketingCut: true,
        franchiseeNet: true,
      },
      _count: { _all: true },
      orderBy: { propertyId: "asc" },
    }),
    prisma.franchiseSettleLedger.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        propertyId: true,
        bookingId: true,
        folioAuditId: true,
        correlationId: true,
        grossFolioAmount: true,
        corporateCut: true,
        marketingCut: true,
        franchiseeNet: true,
        status: true,
        createdAt: true,
        property: { select: { name: true, branchCode: true } },
      },
    }),
  ]);
  return reply.send({
    from: from.toISOString(),
    to: to.toISOString(),
    currency: "USD",
    aggregates: groups.map((group) => ({
      propertyId: group.propertyId,
      status: group.status,
      transactionCount: group._count._all,
      grossFolioAmount: group._sum.grossFolioAmount?.toFixed(2) ?? "0.00",
      royaltyPool: group._sum.corporateCut?.toFixed(2) ?? "0.00",
      marketingPool: group._sum.marketingCut?.toFixed(2) ?? "0.00",
      franchiseeNet: group._sum.franchiseeNet?.toFixed(2) ?? "0.00",
    })),
    transactions: ledgers.map((ledger) => ({
      ...ledger,
      grossFolioAmount: ledger.grossFolioAmount.toFixed(2),
      corporateCut: ledger.corporateCut.toFixed(2),
      marketingCut: ledger.marketingCut.toFixed(2),
      franchiseeNet: ledger.franchiseeNet.toFixed(2),
      drillDown: {
        correlationId: ledger.correlationId,
        href: `/api/v1/reports/drilldown?correlationId=${ledger.correlationId}`,
      },
    })),
    truncated: ledgers.length === 500,
  });
}
