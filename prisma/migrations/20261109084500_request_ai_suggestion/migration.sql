-- CreateEnum
CREATE TYPE "AiSuggestionStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "RequestAiSuggestion" (
    "requestId" UUID NOT NULL,
    "status" "AiSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "categoryId" UUID,
    "priority" "Priority",
    "suggestedDepartmentId" UUID,
    "suggestedAssigneeId" UUID,
    "explanation" VARCHAR(300),
    "failureReason" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RequestAiSuggestion_pkey" PRIMARY KEY ("requestId")
);

-- AddForeignKey
ALTER TABLE "RequestAiSuggestion" ADD CONSTRAINT "RequestAiSuggestion_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAiSuggestion" ADD CONSTRAINT "RequestAiSuggestion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RequestCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAiSuggestion" ADD CONSTRAINT "RequestAiSuggestion_suggestedDepartmentId_fkey" FOREIGN KEY ("suggestedDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAiSuggestion" ADD CONSTRAINT "RequestAiSuggestion_suggestedAssigneeId_fkey" FOREIGN KEY ("suggestedAssigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A READY suggestion always carries category, priority and department.
ALTER TABLE "RequestAiSuggestion" ADD CONSTRAINT "RequestAiSuggestion_ready_complete"
  CHECK ("status" <> 'READY' OR ("categoryId" IS NOT NULL AND "priority" IS NOT NULL AND "suggestedDepartmentId" IS NOT NULL));
