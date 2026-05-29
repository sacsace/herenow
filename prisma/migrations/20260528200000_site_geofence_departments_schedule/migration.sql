-- AlterTable
ALTER TABLE "Company" ADD COLUMN "geofenceMode" TEXT NOT NULL DEFAULT 'OFF';

-- AlterTable
ALTER TABLE "Site" ADD COLUMN "workScheduleMode" TEXT NOT NULL DEFAULT 'COMPANY';
ALTER TABLE "Site" ADD COLUMN "shiftCode" TEXT;
ALTER TABLE "Site" ADD COLUMN "workStartTime" TEXT;
ALTER TABLE "Site" ADD COLUMN "workEndTime" TEXT;

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN "outsideGeofence" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SiteDepartment" (
    "siteId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,

    CONSTRAINT "SiteDepartment_pkey" PRIMARY KEY ("siteId","departmentId")
);

-- CreateIndex
CREATE INDEX "SiteDepartment_departmentId_idx" ON "SiteDepartment"("departmentId");

-- AddForeignKey
ALTER TABLE "SiteDepartment" ADD CONSTRAINT "SiteDepartment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDepartment" ADD CONSTRAINT "SiteDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
