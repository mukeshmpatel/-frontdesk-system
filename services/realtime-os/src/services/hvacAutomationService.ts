import { ClimateProfile } from "@prisma/client";
import { config } from "../config.js";

export type ClimateCommand = {
  thermostatId: string;
  roomNumber: string;
  mode: ClimateProfile;
  propertyTimezone: string;
};

export type ClimateCommandResult =
  | { success: true; status: "APPLIED"; targetTemp: number }
  | { success: false; status: "SKIPPED" | "FAILED"; targetTemp: number; reason: string };

export function targetTemperature(mode: ClimateProfile, timezone: string, now = new Date()) {
  if (mode === ClimateProfile.COMFORT) return 71;
  const month = Number(new Intl.DateTimeFormat("en-US", {
    month: "numeric", timeZone: timezone,
  }).format(now));
  return month >= 11 || month <= 4 ? 62 : 78;
}

export class HvacAutomationService {
  static async adjustRoomClimateProfile(target: ClimateCommand): Promise<ClimateCommandResult> {
    const targetTemp = targetTemperature(target.mode, target.propertyTimezone);
    if (!config.HVAC_GATEWAY_URL || !config.HVAC_API_KEY) {
      return { success: false, status: "SKIPPED", targetTemp, reason: "HVAC_GATEWAY_NOT_CONFIGURED" };
    }
    try {
      const endpoint = new URL(
        `/thermostats/${encodeURIComponent(target.thermostatId)}/setpoint`,
        config.HVAC_GATEWAY_URL,
      );
      const response = await fetch(endpoint, {
        method: "POST",
        signal: AbortSignal.timeout(5_000),
        headers: {
          authorization: `Bearer ${config.HVAC_API_KEY}`,
          "content-type": "application/json",
          "idempotency-key": `room-${target.roomNumber}-${target.mode}`,
        },
        body: JSON.stringify({ temperatureF: targetTemp, profileMode: target.mode }),
      });
      if (!response.ok) {
        return {
          success: false, status: "FAILED", targetTemp,
          reason: `HVAC_GATEWAY_HTTP_${response.status}`,
        };
      }
      return { success: true, status: "APPLIED", targetTemp };
    } catch (error: unknown) {
      return {
        success: false,
        status: "FAILED",
        targetTemp,
        reason: error instanceof Error ? error.name : "HVAC_GATEWAY_ERROR",
      };
    }
  }
}
