import { Department, Prisma, StaffWorkState } from "@prisma/client";

type CandidateScore = {
  id: string;
  mobileNumber: string | null;
  currentRoomId: string | null;
  openTasks: number;
  completedRecently: number;
};

export async function selectNextWorker(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    department: Department;
    roomId: string | null;
    excludeStaffId?: string | null;
  },
) {
  const candidates = await tx.user.findMany({
    where: {
      tenantId: input.tenantId,
      department: input.department,
      active: true,
      isAvailable: true,
      workState: StaffWorkState.AVAILABLE,
      ...(input.excludeStaffId ? { id: { not: input.excludeStaffId } } : {}),
    },
    select: { id: true, mobileNumber: true, currentRoomId: true },
    take: 50,
  });
  if (!candidates.length) return null;
  const ids = candidates.map(({ id }) => id);
  const [open, completed] = await Promise.all([
    tx.internalTask.groupBy({
      by: ["assignedUserId"],
      where: {
        assignedUserId: { in: ids },
        status: { in: ["PENDING", "DISPATCHED", "ACKNOWLEDGED", "IN_PROGRESS", "ESCALATED"] },
      },
      _count: { _all: true },
    }),
    tx.internalTask.groupBy({
      by: ["assignedUserId"],
      where: {
        assignedUserId: { in: ids },
        status: "COMPLETED",
        completedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      },
      _count: { _all: true },
    }),
  ]);
  const openMap = new Map(open.map((item) => [item.assignedUserId, item._count._all]));
  const completedMap = new Map(completed.map((item) => [item.assignedUserId, item._count._all]));
  const scored: CandidateScore[] = candidates.map((candidate) => ({
    ...candidate,
    openTasks: openMap.get(candidate.id) ?? 0,
    completedRecently: completedMap.get(candidate.id) ?? 0,
  }));
  scored.sort((left, right) => {
    const leftNearby = input.roomId && left.currentRoomId === input.roomId ? 1 : 0;
    const rightNearby = input.roomId && right.currentRoomId === input.roomId ? 1 : 0;
    return rightNearby - leftNearby
      || left.openTasks - right.openTasks
      || right.completedRecently - left.completedRecently
      || left.id.localeCompare(right.id);
  });
  return scored[0] ?? null;
}
