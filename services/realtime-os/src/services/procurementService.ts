import { Prisma, PurchaseOrderStatus } from "@prisma/client";
import { appendAudit } from "../audit.js";
import { config } from "../config.js";
import { prisma } from "../infrastructure.js";
import { publishEvent } from "../realtime.js";

type UsageRecipe = ReadonlyArray<{ sku: string; quantity: number }>;

const HOUSEKEEPING_RECIPE: UsageRecipe = [
  { sku: "DET-POD-01", quantity: 2 },
  { sku: "PILLOWCASE-STD", quantity: 4 },
  { sku: "BEDSHEET-STD", quantity: 2 },
];

type VendorDraftResponse = { id: string };

async function submitVendorDraft(po: {
  id: string;
  sku: string;
  quantity: number;
  propertyId: string;
}) {
  if (!config.SUPPLIER_API_URL || !config.SUPPLIER_API_KEY) {
    return { submitted: false as const, reason: "SUPPLIER_INTEGRATION_NOT_CONFIGURED" };
  }
  const response = await fetch(new URL("/v1/purchase-orders/drafts", config.SUPPLIER_API_URL), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.SUPPLIER_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": po.id,
    },
    body: JSON.stringify({
      purchaseOrderId: po.id,
      propertyId: po.propertyId,
      sku: po.sku,
      quantity: po.quantity,
      mode: "DRAFT",
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Supplier draft API returned HTTP ${response.status}.`);
  }
  const body = await response.json() as VendorDraftResponse;
  if (!body.id) throw new Error("Supplier draft API response did not include an order ID.");
  return { submitted: true as const, vendorDraftId: body.id };
}

export class ProcurementService {
  static async processCompletedHousekeepingTask(taskId: string): Promise<void> {
    const correlationId = crypto.randomUUID();
    const drafts = await prisma.$transaction(async (tx) => {
      const task = await tx.internalTask.findUnique({
        where: { id: taskId },
        include: { property: { select: { tenantId: true } } },
      });
      if (!task || task.status !== "COMPLETED" || task.assignedRole !== "HOUSEKEEPING") return [];

      const createdDrafts: Array<{
        id: string; sku: string; quantity: number; propertyId: string;
        tenantId: string; itemId: string;
      }> = [];
      for (const recipe of HOUSEKEEPING_RECIPE) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${task.propertyId}:${recipe.sku}`}))`;
        const item = await tx.hotelInventoryItem.findUnique({
          where: { propertyId_sku: { propertyId: task.propertyId, sku: recipe.sku } },
        });
        if (!item?.active) continue;
        const alreadyConsumed = await tx.inventoryUsageLedger.findUnique({
          where: { taskId_inventoryItemId: { taskId: task.id, inventoryItemId: item.id } },
          select: { id: true },
        });
        if (alreadyConsumed) continue;

        const balanceAfter = Math.max(0, item.currentQuantity - recipe.quantity);
        await tx.hotelInventoryItem.update({
          where: { id: item.id },
          data: { currentQuantity: balanceAfter },
        });
        await tx.inventoryUsageLedger.create({
          data: {
            propertyId: task.propertyId,
            inventoryItemId: item.id,
            taskId: task.id,
            roomId: task.roomId,
            correlationId,
            quantityDelta: -Math.min(recipe.quantity, item.currentQuantity),
            balanceAfter,
            reason: "HOUSEKEEPING_TASK_COMPLETED",
          },
        });

        if (balanceAfter <= item.reorderThreshold) {
          const existing = await tx.vendorPurchaseOrder.findFirst({
            where: {
              propertyId: task.propertyId,
              inventoryItemId: item.id,
              status: { in: [
                PurchaseOrderStatus.DRAFT,
                PurchaseOrderStatus.SUBMITTED,
                PurchaseOrderStatus.APPROVED,
              ] },
            },
            select: { id: true },
          });
          if (!existing) {
            const quantity = Math.max(1, item.targetQuantity - balanceAfter);
            const totalCost = new Prisma.Decimal(item.unitCost).mul(quantity);
            const po = await tx.vendorPurchaseOrder.create({
              data: {
                tenantId: task.property.tenantId,
                propertyId: task.propertyId,
                inventoryItemId: item.id,
                correlationId,
                sku: item.sku,
                quantity,
                unitCost: item.unitCost,
                totalCost,
                status: PurchaseOrderStatus.DRAFT,
              },
            });
            createdDrafts.push({
              id: po.id, sku: po.sku, quantity: po.quantity,
              propertyId: po.propertyId, tenantId: po.tenantId, itemId: item.id,
            });
          }
        }
      }
      await appendAudit(tx, {
        tenantId: task.property.tenantId,
        propertyId: task.propertyId,
        authorType: "SYSTEM",
        authorId: "AAIQ-PROCUREMENT",
        eventType: "HOUSEKEEPING_INVENTORY_CONSUMED",
        entityType: "TASK",
        entityId: task.id,
        correlationId,
        modifiedTables: [
          "hotel_inventory_items", "inventory_usage_ledger",
          "vendor_purchase_orders", "system_audit_trail",
        ],
        delta: { taskId: task.id, roomId: task.roomId, recipe: HOUSEKEEPING_RECIPE },
      });
      return createdDrafts;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    for (const draft of drafts) {
      try {
        const result = await submitVendorDraft(draft);
        await prisma.vendorPurchaseOrder.update({
          where: { id: draft.id },
          data: result.submitted
            ? { status: PurchaseOrderStatus.SUBMITTED, vendorDraftId: result.vendorDraftId, submittedAt: new Date() }
            : { failureReason: result.reason },
        });
        await publishEvent({
          type: "inventory.updated",
          tenantId: draft.tenantId,
          propertyId: draft.propertyId,
          entityId: draft.itemId,
          occurredAt: new Date().toISOString(),
          payload: { purchaseOrderId: draft.id, supplierDraftCreated: result.submitted },
        });
      } catch (error) {
        await prisma.vendorPurchaseOrder.update({
          where: { id: draft.id },
          data: {
            status: PurchaseOrderStatus.FAILED,
            failureReason: error instanceof Error ? error.message.slice(0, 500) : "Supplier draft failed.",
          },
        });
      }
    }
  }

  static async scanLowStock(): Promise<number> {
    const tasks = await prisma.internalTask.findMany({
      where: {
        status: "COMPLETED",
        assignedRole: "HOUSEKEEPING",
        completedAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
      },
      select: { id: true },
      take: 2_000,
    });
    await Promise.all(tasks.map(({ id }) => this.processCompletedHousekeepingTask(id)));
    return tasks.length;
  }
}
