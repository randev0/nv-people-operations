-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'MANAGER', 'HR_ADMIN');

-- CreateEnum
CREATE TYPE "CountryCode" AS ENUM ('BD', 'MY', 'LK', 'CY');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ON_PROBATION', 'ON_NOTICE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RequestEventKind" AS ENUM ('CREATED', 'ASSIGNED', 'REASSIGNED', 'STATUS_CHANGED');

-- CreateTable
CREATE TABLE "Country" (
    "code" "CountryCode" NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "countryCode" "CountryCode" NOT NULL,
    "departmentId" UUID NOT NULL,
    "managerId" UUID,
    "joiningDate" DATE NOT NULL,
    "employmentStatus" "EmploymentStatus" NOT NULL,
    "loginEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestCategory" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "defaultDepartmentId" UUID NOT NULL,

    CONSTRAINT "RequestCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(5000) NOT NULL,
    "categoryId" UUID NOT NULL,
    "priority" "Priority" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "requesterId" UUID NOT NULL,
    "assigneeId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "resolvedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestComment" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" VARCHAR(3000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "kind" "RequestEventKind" NOT NULL,
    "fromStatus" "RequestStatus",
    "toStatus" "RequestStatus" NOT NULL,
    "previousAssigneeId" UUID,
    "newAssigneeId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTemplate" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OnboardingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateTask" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(3000) NOT NULL,
    "departmentId" UUID NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "TemplateTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateDependency" (
    "taskId" UUID NOT NULL,
    "prerequisiteTaskId" UUID NOT NULL,

    CONSTRAINT "TemplateDependency_pkey" PRIMARY KEY ("taskId","prerequisiteTaskId")
);

-- CreateTable
CREATE TABLE "Onboarding" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "templateName" VARCHAR(120) NOT NULL,
    "startDate" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "assignedById" UUID NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Onboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTask" (
    "id" UUID NOT NULL,
    "onboardingId" UUID NOT NULL,
    "sourceTaskKey" VARCHAR(50) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(3000) NOT NULL,
    "departmentId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "sortOrder" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OnboardingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "taskId" UUID NOT NULL,
    "prerequisiteTaskId" UUID NOT NULL,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("taskId","prerequisiteTaskId")
);

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "fromStatus" "TaskStatus" NOT NULL,
    "toStatus" "TaskStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "keyHash" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("keyHash")
);

-- CreateTable
CREATE TABLE "AiUsageBucket" (
    "userId" UUID NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "AiUsageBucket_pkey" PRIMARY KEY ("userId","windowStart")
);

-- CreateIndex
CREATE UNIQUE INDEX "Country_name_key" ON "Country"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_managerId_idx" ON "User"("managerId");

-- CreateIndex
CREATE INDEX "User_countryCode_employmentStatus_idx" ON "User"("countryCode", "employmentStatus");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestCategory_code_key" ON "RequestCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_number_key" ON "ServiceRequest"("number");

-- CreateIndex
CREATE INDEX "ServiceRequest_requesterId_createdAt_idx" ON "ServiceRequest"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_assigneeId_status_idx" ON "ServiceRequest"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "ServiceRequest_status_categoryId_idx" ON "ServiceRequest"("status", "categoryId");

-- CreateIndex
CREATE INDEX "ServiceRequest_priority_idx" ON "ServiceRequest"("priority");

-- CreateIndex
CREATE INDEX "RequestComment_requestId_createdAt_idx" ON "RequestComment"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestEvent_requestId_createdAt_idx" ON "RequestEvent"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "TemplateTask_templateId_sortOrder_idx" ON "TemplateTask"("templateId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateTask_templateId_key_key" ON "TemplateTask"("templateId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateTask_templateId_sortOrder_key" ON "TemplateTask"("templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "TemplateDependency_prerequisiteTaskId_idx" ON "TemplateDependency"("prerequisiteTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "Onboarding_employeeId_key" ON "Onboarding"("employeeId");

-- CreateIndex
CREATE INDEX "OnboardingTask_ownerId_status_idx" ON "OnboardingTask"("ownerId", "status");

-- CreateIndex
CREATE INDEX "OnboardingTask_onboardingId_status_idx" ON "OnboardingTask"("onboardingId", "status");

-- CreateIndex
CREATE INDEX "OnboardingTask_dueDate_status_idx" ON "OnboardingTask"("dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingTask_onboardingId_sourceTaskKey_key" ON "OnboardingTask"("onboardingId", "sourceTaskKey");

-- CreateIndex
CREATE INDEX "TaskDependency_prerequisiteTaskId_idx" ON "TaskDependency"("prerequisiteTaskId");

-- CreateIndex
CREATE INDEX "TaskEvent_taskId_createdAt_idx" ON "TaskEvent"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "LoginThrottle_expiresAt_idx" ON "LoginThrottle"("expiresAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestCategory" ADD CONSTRAINT "RequestCategory_defaultDepartmentId_fkey" FOREIGN KEY ("defaultDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RequestCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestComment" ADD CONSTRAINT "RequestComment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestComment" ADD CONSTRAINT "RequestComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_previousAssigneeId_fkey" FOREIGN KEY ("previousAssigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_newAssigneeId_fkey" FOREIGN KEY ("newAssigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTemplate" ADD CONSTRAINT "OnboardingTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTask" ADD CONSTRAINT "TemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OnboardingTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTask" ADD CONSTRAINT "TemplateTask_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateDependency" ADD CONSTRAINT "TemplateDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TemplateTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateDependency" ADD CONSTRAINT "TemplateDependency_prerequisiteTaskId_fkey" FOREIGN KEY ("prerequisiteTaskId") REFERENCES "TemplateTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Onboarding" ADD CONSTRAINT "Onboarding_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Onboarding" ADD CONSTRAINT "Onboarding_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OnboardingTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Onboarding" ADD CONSTRAINT "Onboarding_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "Onboarding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "OnboardingTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_prerequisiteTaskId_fkey" FOREIGN KEY ("prerequisiteTaskId") REFERENCES "OnboardingTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "OnboardingTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageBucket" ADD CONSTRAINT "AiUsageBucket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written integrity constraints (not expressible in Prisma schema).
-- ---------------------------------------------------------------------------
ALTER TABLE "User" ADD CONSTRAINT "User_manager_not_self" CHECK ("managerId" IS NULL OR "managerId" <> "id");
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_assignee_matches_status"
  CHECK (("status" = 'SUBMITTED' AND "assigneeId" IS NULL) OR ("status" <> 'SUBMITTED' AND "assigneeId" IS NOT NULL));
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_version_positive" CHECK ("version" >= 1);
ALTER TABLE "TemplateTask" ADD CONSTRAINT "TemplateTask_dueDay_min" CHECK ("dueDay" >= 1);
ALTER TABLE "TemplateTask" ADD CONSTRAINT "TemplateTask_sortOrder_min" CHECK ("sortOrder" >= 0);
ALTER TABLE "TemplateDependency" ADD CONSTRAINT "TemplateDependency_no_self" CHECK ("taskId" <> "prerequisiteTaskId");
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_dueDay_min" CHECK ("dueDay" >= 1);
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_completed_has_timestamp"
  CHECK (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL));
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_no_self" CHECK ("taskId" <> "prerequisiteTaskId");
