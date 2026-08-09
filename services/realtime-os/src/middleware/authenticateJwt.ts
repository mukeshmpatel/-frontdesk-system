import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthUser, JwtIdentityClaims } from "../contracts.js";
import { prisma } from "../infrastructure.js";

const identitySchema = z.object({
  sub: z.string().uuid(),
  tenantId: z.string().uuid(),
  email: z.string().email().optional(),
});

/**
 * Verifies the JWT signature, then reloads current RBAC attributes from the
 * database. Authorization never trusts department or tier values in the token.
 */
export async function authenticateStaffJwt(request: FastifyRequest, reply: FastifyReply) {
  let claims: JwtIdentityClaims;
  try {
    await request.jwtVerify<JwtIdentityClaims>();
    claims = identitySchema.parse(request.user);
  } catch {
    return reply.code(401).send({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Please sign in with a valid staff session.",
      },
    });
  }

  const staff = await prisma.user.findFirst({
    where: { id: claims.sub, tenantId: claims.tenantId, active: true },
    select: {
      id: true,
      tenantId: true,
      email: true,
      role: true,
      department: true,
      tier: true,
      isAvailable: true,
      workState: true,
    },
  });
  if (!staff) {
    return reply.code(401).send({
      error: {
        code: "STAFF_PROFILE_INACTIVE",
        message: "This staff profile is unavailable or inactive.",
      },
    });
  }
  request.authUser = {
    sub: staff.id,
    tenantId: staff.tenantId,
    email: staff.email,
    role: staff.role,
    department: staff.department,
    tier: staff.tier,
    isAvailable: staff.isAvailable,
    workState: staff.workState,
  } satisfies AuthUser;
}
