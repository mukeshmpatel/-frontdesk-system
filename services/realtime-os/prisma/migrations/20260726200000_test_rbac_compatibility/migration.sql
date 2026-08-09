CREATE TYPE "Department" AS ENUM ('FRONT_DESK', 'HOUSEKEEPING', 'MAINTENANCE', 'EXECUTIVE');
CREATE TYPE "RoleTier" AS ENUM ('ASSOCIATE', 'SUPERVISOR', 'MANAGER', 'CORPORATE');

ALTER TABLE "users"
  ADD COLUMN "department" "Department" NOT NULL DEFAULT 'FRONT_DESK',
  ADD COLUMN "tier" "RoleTier" NOT NULL DEFAULT 'ASSOCIATE',
  ADD COLUMN "job_title" VARCHAR(120),
  ADD COLUMN "is_available" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "current_room_id" UUID;

UPDATE "users"
SET "department" = CASE "role"
  WHEN 'HOUSEKEEPING' THEN 'HOUSEKEEPING'::"Department"
  WHEN 'MAINTENANCE' THEN 'MAINTENANCE'::"Department"
  WHEN 'MANAGEMENT' THEN 'EXECUTIVE'::"Department"
  ELSE 'FRONT_DESK'::"Department"
END;

UPDATE "users"
SET "tier" = 'MANAGER'::"RoleTier"
WHERE "role" = 'MANAGEMENT';

CREATE INDEX "users_tenant_id_department_tier_active_idx"
  ON "users"("tenant_id", "department", "tier", "active");

ALTER TABLE "users"
  ADD CONSTRAINT "users_current_room_id_fkey"
  FOREIGN KEY ("current_room_id") REFERENCES "rooms"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
