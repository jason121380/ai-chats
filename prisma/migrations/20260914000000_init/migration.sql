-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('SOLO', 'COMPARE', 'COUNCIL', 'BATTLE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageSource" AS ENUM ('USER', 'MODEL', 'CHAIRMAN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ProviderName" AS ENUM ('OPENAI', 'ANTHROPIC', 'GOOGLE', 'XAI', 'MUSE', 'SPARK');

-- CreateEnum
CREATE TYPE "CouncilRunStatus" AS ENUM ('PENDING', 'ROUND_1', 'CRITIQUE', 'CHAIRMAN', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ModelRunStage" AS ENUM ('SOLO', 'COMPARE', 'ROUND_1', 'CRITIQUE', 'CHAIRMAN');

-- CreateEnum
CREATE TYPE "CouncilRole" AS ENUM ('STRATEGIST', 'RISK_ANALYST', 'RESEARCHER', 'DEVILS_ADVOCATE', 'CREATIVE', 'EXECUTION', 'CHAIRMAN', 'GENERAL');

-- CreateEnum
CREATE TYPE "ModelRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PricingStatus" AS ENUM ('CALCULATED', 'MISSING', 'UNSUPPORTED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "title" TEXT NOT NULL,
    "mode" "SessionMode" NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "source" "MessageSource" NOT NULL,
    "content" TEXT NOT NULL,
    "modelRunId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouncilRun" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "userMessageId" UUID NOT NULL,
    "status" "CouncilRunStatus" NOT NULL DEFAULT 'PENDING',
    "currentStage" "ModelRunStage",
    "chairmanProvider" "ProviderName" NOT NULL,
    "chairmanModel" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "totalInputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalReasoningTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCostUsd" DECIMAL(18,10),
    "totalLatencyMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouncilRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelRun" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "councilRunId" UUID,
    "provider" "ProviderName" NOT NULL,
    "modelId" TEXT NOT NULL,
    "stage" "ModelRunStage" NOT NULL,
    "role" "CouncilRole" NOT NULL DEFAULT 'GENERAL',
    "status" "ModelRunStatus" NOT NULL DEFAULT 'PENDING',
    "prompt" TEXT NOT NULL,
    "response" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "latencyMs" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "providerRequestId" TEXT,
    "finishReason" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "rawUsage" JSONB,
    "rawResponseMetadata" JSONB,
    "inputPricePerMillionUsd" DECIMAL(18,10),
    "outputPricePerMillionUsd" DECIMAL(18,10),
    "cachedInputPricePerMillionUsd" DECIMAL(18,10),
    "reasoningPricePerMillionUsd" DECIMAL(18,10),
    "inputCostUsd" DECIMAL(18,10),
    "outputCostUsd" DECIMAL(18,10),
    "cachedInputCostUsd" DECIMAL(18,10),
    "reasoningCostUsd" DECIMAL(18,10),
    "totalCostUsd" DECIMAL(18,10),
    "pricingStatus" "PricingStatus" NOT NULL DEFAULT 'MISSING',
    "pricingEffectiveAt" TIMESTAMP(3),
    "pricingSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelConfig" (
    "id" UUID NOT NULL,
    "provider" "ProviderName" NOT NULL,
    "modelId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "supportsStreaming" BOOLEAN NOT NULL DEFAULT true,
    "supportsVision" BOOLEAN NOT NULL DEFAULT false,
    "supportsReasoning" BOOLEAN NOT NULL DEFAULT false,
    "defaultRole" "CouncilRole" NOT NULL DEFAULT 'GENERAL',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "temperature" DOUBLE PRECISION,
    "maxOutputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelPricing" (
    "id" UUID NOT NULL,
    "provider" "ProviderName" NOT NULL,
    "modelId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "inputPerMillion" DECIMAL(18,10) NOT NULL,
    "outputPerMillion" DECIMAL(18,10) NOT NULL,
    "cachedInputPerMillion" DECIMAL(18,10),
    "reasoningPerMillion" DECIMAL(18,10),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelPricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_createdAt_idx" ON "Session"("createdAt");

-- CreateIndex
CREATE INDEX "Session_updatedAt_idx" ON "Session"("updatedAt");

-- CreateIndex
CREATE INDEX "Message_sessionId_createdAt_idx" ON "Message"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "CouncilRun_sessionId_createdAt_idx" ON "CouncilRun"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "CouncilRun_status_idx" ON "CouncilRun"("status");

-- CreateIndex
CREATE INDEX "ModelRun_councilRunId_idx" ON "ModelRun"("councilRunId");

-- CreateIndex
CREATE INDEX "ModelRun_sessionId_idx" ON "ModelRun"("sessionId");

-- CreateIndex
CREATE INDEX "ModelRun_provider_modelId_idx" ON "ModelRun"("provider", "modelId");

-- CreateIndex
CREATE INDEX "ModelRun_stage_idx" ON "ModelRun"("stage");

-- CreateIndex
CREATE INDEX "ModelRun_status_idx" ON "ModelRun"("status");

-- CreateIndex
CREATE INDEX "ModelRun_startedAt_idx" ON "ModelRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModelConfig_provider_modelId_key" ON "ModelConfig"("provider", "modelId");

-- CreateIndex
CREATE INDEX "ModelPricing_provider_modelId_effectiveFrom_idx" ON "ModelPricing"("provider", "modelId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_modelRunId_fkey" FOREIGN KEY ("modelRunId") REFERENCES "ModelRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilRun" ADD CONSTRAINT "CouncilRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilRun" ADD CONSTRAINT "CouncilRun_userMessageId_fkey" FOREIGN KEY ("userMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelRun" ADD CONSTRAINT "ModelRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelRun" ADD CONSTRAINT "ModelRun_councilRunId_fkey" FOREIGN KEY ("councilRunId") REFERENCES "CouncilRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
