import { z } from "zod";
import type { AssignedRole, Department, RoleTier, StaffWorkState } from "@prisma/client";

export const intakeRequestSchema = z.object({
  propertyId: z.string().uuid(),
  text: z.string().max(20_000).optional(),
  chat_history_chunk: z.array(z.object({
    author: z.string().max(120),
    text: z.string().max(8_000),
    timestamp: z.string().datetime().optional(),
  })).max(100).optional(),
  audio_url: z.string().url().optional(),
  media_urls: z.array(z.string().url()).max(10).optional(),
}).refine((value) => Boolean(value.text || value.chat_history_chunk?.length || value.audio_url || value.media_urls?.length), "At least one input is required.");

export const extractedIntentSchema = z.object({
  intent: z.enum(["CREATE_REMINDER", "SCHEDULE_CALENDAR_BLOCK", "DISPATCH_TASK", "UNKNOWN"]),
  extractedMetadata: z.object({
    title: z.string().min(1).max(180),
    description: z.string().min(1).max(4_000),
    targetTime: z.string().datetime(),
    assignedToRole: z.enum(["MAINTENANCE", "HOUSEKEEPING", "FRONT_DESK", "MANAGEMENT"]),
    associatedRoomId: z.string().nullable(),
    urgency: z.enum(["LOW", "MEDIUM", "CRITICAL"]),
  }),
  confidence: z.number().min(0).max(1),
});

export type IntakeRequest = z.infer<typeof intakeRequestSchema>;
export type ExtractedIntent = z.infer<typeof extractedIntentSchema>;
export type AuthUser = {
  sub: string;
  tenantId: string;
  email: string;
  role: AssignedRole;
  department: Department;
  tier: RoleTier;
  isAvailable: boolean;
  workState: StaffWorkState;
};

export type JwtIdentityClaims = {
  sub: string;
  tenantId: string;
  email?: string | undefined;
};
