import bcrypt from "bcrypt";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma, redis } from "../infrastructure.js";
import { checksum } from "../security.js";

const bodySchema = z.object({
  email: z.string().email().max(320).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(200),
  tenantId: z.string().uuid().optional(),
});

const dummyHash = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.yrpGN9J2S2lN4T5nF6f7MeWZMYm3Dxu";
const MAX_ATTEMPTS = 8;
const WINDOW_SECONDS = 15 * 60;

export async function loginStaffMemberController(request: FastifyRequest, reply: FastifyReply) {
  const input = bodySchema.parse(request.body);
  const key = `auth-fail:${checksum(`${request.ip}:${input.email}`)}`;
  const failures = Number(await redis.get(key) ?? "0");
  if (failures >= MAX_ATTEMPTS) {
    return reply.code(429).send({
      error: { code: "LOGIN_RATE_LIMITED", message: "Too many failed attempts. Try again later." },
    });
  }

  const candidates = await prisma.user.findMany({
    where: {
      email: { equals: input.email, mode: "insensitive" },
      active: true,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      email: true,
      displayName: true,
      department: true,
      tier: true,
      passwordHash: true,
    },
    take: 2,
  });
  if (candidates.length > 1) {
    return reply.code(409).send({
      error: {
        code: "TENANT_SELECTION_REQUIRED",
        message: "This account belongs to multiple organizations. Select an organization to continue.",
      },
    });
  }
  const staff = candidates[0];
  const valid = await bcrypt.compare(input.password, staff?.passwordHash ?? dummyHash);
  if (!staff || !valid) {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, WINDOW_SECONDS);
    request.log.warn({ event: "STAFF_LOGIN_FAILED", emailHash: checksum(input.email), ip: request.ip });
    return reply.code(401).send({
      error: { code: "INVALID_CREDENTIALS", message: "Invalid email address or password." },
    });
  }

  await redis.del(key);
  const token = await reply.jwtSign(
    {
      tenantId: staff.tenantId,
      email: staff.email,
      department: staff.department,
      tier: staff.tier,
    },
    { sign: { sub: staff.id, expiresIn: "12h" } },
  );
  reply.setCookie("aaiq_session_token", token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 12 * 60 * 60,
  });
  request.log.info({ event: "STAFF_LOGIN_SUCCEEDED", staffId: staff.id, tenantId: staff.tenantId });
  return reply.code(200).send({
    success: true,
    profile: {
      id: staff.id,
      displayName: staff.displayName,
      department: staff.department,
      tier: staff.tier,
    },
  });
}
