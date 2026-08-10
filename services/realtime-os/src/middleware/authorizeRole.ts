import { Department, RoleTier } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";

export const tierWeight: Readonly<Record<RoleTier, number>> = {
  ASSOCIATE: 1,
  SUPERVISOR: 2,
  MANAGER: 3,
  CORPORATE: 4,
};

export function hasRoleAccess(
  staff: { department: Department; tier: RoleTier },
  allowedDepartments: readonly Department[],
  minimumTier: RoleTier,
) {
  if (staff.tier === RoleTier.CORPORATE) return true;
  return allowedDepartments.includes(staff.department)
    && tierWeight[staff.tier] >= tierWeight[minimumTier];
}

/**
 * Fastify hierarchical RBAC guard. Authentication and database hydration must
 * execute first so this guard evaluates current, server-owned permissions.
 */
export function authorizeRole(
  allowedDepartments: readonly Department[],
  minimumTier: RoleTier,
) {
  return async function roleGuard(request: FastifyRequest, reply: FastifyReply) {
    const staff = request.authUser;
    if (!staff) {
      return reply.code(401).send({
        error: { code: "AUTHENTICATION_REQUIRED", message: "A staff session is required." },
      });
    }
    if (hasRoleAccess(staff, allowedDepartments, minimumTier)) return;
    request.log.warn({
      event: "RBAC_ACCESS_DENIED",
      staffId: staff.sub,
      department: staff.department,
      tier: staff.tier,
      route: request.routeOptions.url,
    });
    return reply.code(403).send({
      error: {
        code: "INSUFFICIENT_CLEARANCE",
        message: "Your department or role tier does not permit this action.",
      },
    });
  };
}
