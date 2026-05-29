-- AlterTable
ALTER TABLE "Company" ADD COLUMN "shiftPresets" JSONB;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "workScheduleType" TEXT NOT NULL DEFAULT 'COMPANY';
ALTER TABLE "Employee" ADD COLUMN "shiftCode" TEXT;
ALTER TABLE "Employee" ADD COLUMN "workStartTime" TEXT;
ALTER TABLE "Employee" ADD COLUMN "workEndTime" TEXT;
ALTER TABLE "Employee" ADD COLUMN "workScheduleByDay" JSONB;
