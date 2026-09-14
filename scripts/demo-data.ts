/**
 * Local UI preview only. Runs a full council with MOCK providers so the
 * screens have realistic data without spending a cent on real APIs.
 * Not part of the app; safe to delete.
 */
import { PrismaClient, type ProviderName } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

import { ProviderRegistry } from "../src/server/ai/registry"
import { runCouncil } from "../src/server/council/orchestrator"
import { executeModelRun } from "../src/server/ai/router"
import type { AIRequest, AIResponse } from "../src/server/ai/types"
import { ProviderError } from "../src/server/ai/types"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter })

const MODELS: Array<{ provider: ProviderName; modelId: string }> = [
  { provider: "OPENAI", modelId: "gpt-5.1" },
  { provider: "ANTHROPIC", modelId: "claude-sonnet-4-5" },
  { provider: "GOOGLE", modelId: "gemini-2.5-pro" },
  { provider: "XAI", modelId: "grok-4" },
]

const PRICES: Record<string, [string, string]> = {
  "gpt-5.1": ["1.25", "10"],
  "claude-sonnet-4-5": ["3", "15"],
  "gemini-2.5-pro": ["1.25", "10"],
  "grok-4": ["3", "15"],
}

const ROUND_ONE: Record<string, string> = {
  "gpt-5.1": `越南美髮市場的核心機會在於：都市化速度快、25-35 歲女性可支配所得年增約兩位數，而連鎖化程度極低——多數仍是單店經營。

**策略判斷：值得進入，但不是現在全速。**

建議分三階段：
1. 前六個月在胡志明市第一郡與第七郡開 2 家旗艦店，驗證定價帶與客單價。
2. 若單店月營收達損益兩平的 1.3 倍，再啟動加盟模式複製。
3. 第二年才考慮河內。

關鍵是不要把台灣的價格結構直接搬過去。越南的白領客群願意為「台灣技術」付溢價，但溢價上限大約是本地高端沙龍的 1.4 倍，不是 3 倍。`,
  "claude-sonnet-4-5": `我要指出三個被低估的風險。

**一、人力是最大的隱藏成本。**
越南美髮師的技術水平分布極廣，而台灣的 SOP 化訓練體系在跨語言環境的複製成本遠高於預期。名留在台灣的優勢建立在標準化訓練上，這個優勢在越南前兩年幾乎無法發揮。

**二、法規與外資結構。**
美容服務業雖然開放外資 100% 持股，但實務上租約、消防、衛生許可的地方性差異極大。建議先確認地方層級的實際執行慣例，而非只看中央法規。

**三、現金流錯配。**
海外展店的回收期通常比國內長 8-14 個月。如果集團同期還有國內展店計畫，資金排程會互相排擠。

我的建議：先用合資或授權模式試水溫，不要一開始就直接投資自有店。`,
  "gemini-2.5-pro": `就可比案例來看，幾個數據點值得參考：

- 韓國美髮連鎖 Juno Hair 於 2017 年進入越南，目前僅維持 3 家直營店，未如原訂計畫擴張。
- 日本 EARTH 集團在越南採取合資模式，2019 年進入，2023 年達 8 家店。
- 越南本土連鎖 30Shine 已有 100+ 門市，主攻男性市場，客單價約 150,000 VND。

**推論：**
成功案例集中在「合資 + 差異化定位」，直營快速擴張的案例普遍受挫。30Shine 已經佔住平價男性市場，名留若進入應避開此區間。

女性中高端市場（客單價 400,000-800,000 VND）目前仍以獨立沙龍為主，連鎖滲透率低於 10%——這是實際的空白帶。

需要補充查證：越南美髮市場規模的公開數據品質不佳，多數報告來自業者自行推估。`,
  "grok-4": `讓我唱個反調：這個問題問錯了。

真正該問的不是「該不該投資越南」，而是「為什麼是越南，而不是把同樣的資本投在台灣既有 200 家門市的單店效益提升上？」

如果台灣單店月營收提升 5%，以 200 家計算的絕對金額，可能遠大於越南前三年的全部獲利，而且風險趨近於零。

**幾個沒人願意說的假設：**
- 「越南市場成長快」——成長的是整體消費，不代表美髮連鎖的單位經濟會成立。
- 「台灣技術有溢價」——這個假設在韓流髮型主導的東南亞市場非常脆弱。越南消費者的美感參照系是首爾，不是台北。
- 「先進去卡位」——美髮業沒有網路效應，先進者優勢極弱。租約可以被出價更高的人搶走。

如果一定要做，我會建議：不要投資，改做技術授權。收授權金，零資本風險，失敗了也只是少賺。`,
}

const CRITIQUE_TEMPLATE = (label: string) =>
  `**最認同：Response ${label}**——它是唯一把「進入模式」和「進入與否」分開討論的，這個切分正確。

**最不認同的論點**是那個假設台灣技術能自動轉換成溢價的推論，缺乏越南本地消費者調研支撐。

**各方案的主要漏洞：**
- Response A 的三階段時程沒有說明若第一階段未達標的退出條件，這是致命的缺口。
- Response B 指出人力風險正確，但低估了可以用「台籍店長 + 本地技師」的混合編制緩解。
- Response C 的可比案例有價值，但 Juno Hair 的失敗原因可能是品牌定位而非市場結構。
- Response D 的機會成本論述最尖銳，但忽略了台灣市場已接近飽和，5% 的單店提升並非唾手可得。

**缺乏證據的假設：**所有方案都假設越南中高端女性市場的連鎖滲透率低是「機會」，但也可能是「這個區間的連鎖模式不成立」的訊號。這一點沒有人驗證。

**修正後的最佳方案：**先投入約 200 萬台幣做三個月的實地市場驗證與消費者訪談，再決定投資模式。這筆錢相對於展店資本極小，但能消除最大的不確定性。`

const CHAIRMAN_ANSWER = `## Executive Summary

建議**有條件地進入越南市場，但不採取直營快速展店**。先以三個月、約新台幣 200 萬元的市場驗證專案消除關鍵不確定性，再依驗證結果在「合資展店」與「技術授權」之間二選一。不建議現階段投入自有資本直接開設直營店。

## Consensus

四位顧問一致同意的部分：

- 越南中高端女性美髮市場的連鎖滲透率確實偏低（10% 以下），存在結構性空白。
- 平價男性市場已被 30Shine 等本土連鎖佔據，不應進入。
- 直營快速擴張在可比案例中普遍受挫，合資或授權模式的成功率明顯較高。
- 台灣的 SOP 化訓練優勢在越南前兩年難以完全發揮。

## Key Disagreements

**最重大的分歧在於「台灣技術溢價」是否成立。** 策略觀點假設越南白領願意為台灣技術付 1.4 倍溢價；反對觀點指出越南消費者的美感參照系是首爾而非台北，此假設脆弱。研究觀點提供的資料無法裁決此爭議——這正是需要實地驗證的核心問題。

**次要分歧在於機會成本。** 反對觀點主張同樣資本投入台灣 200 家既有門市的單店效益提升，風險趨近於零且絕對金額可能更大。此論點有力，但台灣市場接近飽和，5% 的單店提升並非低垂果實，兩者不應直接類比。

## Key Risks

1. **技術溢價假設失效**（高影響、中機率）：若越南消費者不為台灣技術付溢價，整個定價模型崩潰。
2. **人力訓練成本超支**（中影響、高機率）：跨語言 SOP 複製成本普遍被低估 1.5-2 倍。
3. **現金流與國內展店排擠**（高影響、中機率）：海外回收期比國內長 8-14 個月。
4. **缺乏退出條件**（高影響、高機率）：目前所有方案都未定義第一階段未達標時的停損點。

## Recommended Decision

**不直接投資展店。啟動「越南市場驗證專案」。**

理由：四位顧問的分歧全部集中在同一個可驗證的事實問題上——越南目標客群是否願意為台灣技術付溢價。這個問題用 200 萬元、三個月可以回答，而錯誤的展店決策代價是數千萬元與兩年時間。在不確定性可以被便宜地消除時，先消除它。

## Action Plan

| 時程 | 行動 | 負責 | 成功判準 |
|---|---|---|---|
| 第 1 個月 | 胡志明市第一郡、第七郡實地走訪，訪談 30 位目標客群、10 家本地高端沙龍 | 事業發展 | 完成訪談，取得定價接受度區間 |
| 第 1-2 個月 | 確認地方層級租約、消防、衛生許可實務慣例 | 法務 | 取得書面法規清單 |
| 第 2 個月 | 人力成本建模：台籍店長 + 本地技師混合編制 | 營運 | 三年人力成本模型 |
| 第 3 個月 | 同步接觸 2-3 家潛在合資夥伴與授權對象 | 執行副總 | 至少 1 份意向書 |
| 第 3 個月底 | 決策會議：合資展店 / 技術授權 / 不進入 | 董事會 | 明確決議 |

**停損條件：** 若訪談顯示目標客群對台灣技術的溢價接受度低於本地高端沙龍的 1.2 倍，直接終止，不進入越南。

## Confidence

**Medium。**

支撐這個建議的推理本身穩固——在不確定性可被低成本消除時先驗證，是標準且正確的決策程序。信心不是 High 的原因在於：所有顧問引用的越南市場數據品質都不佳，多數來自業者自行推估，因此連「連鎖滲透率低於 10%」這個共識前提本身都需要驗證。

**會改變我判斷的資訊：** 若已有可靠的第一手資料證明台灣品牌在越南的溢價接受度，則可跳過驗證階段直接進入合資談判；反之若發現越南已有台資美髮連鎖經營失敗的案例，則應直接否決。`

async function main() {
  console.log("Seeding demo pricing…")
  for (const m of MODELS) {
    const [input, output] = PRICES[m.modelId]
    const existing = await db.modelPricing.findFirst({
      where: { provider: m.provider, modelId: m.modelId, effectiveTo: null },
    })
    if (!existing) {
      await db.modelPricing.create({
        data: {
          provider: m.provider,
          modelId: m.modelId,
          inputPerMillion: input,
          outputPerMillion: output,
          cachedInputPerMillion: (Number(input) / 10).toString(),
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          source: "DEMO DATA — replace with real prices",
        },
      })
    }
  }

  const TOKENS: Record<string, [number, number]> = {
    "gpt-5.1": [1840, 2002],
    "claude-sonnet-4-5": [1840, 2378],
    "gemini-2.5-pro": [1840, 3181],
    "grok-4": [1840, 1771],
  }

  const registry = new ProviderRegistry()
  for (const m of MODELS) {
    registry.register({
      provider: m.provider,
      async generate(req: AIRequest): Promise<AIResponse> {
        // Simulate provider latency.
        await new Promise((r) => setTimeout(r, 200 + Math.random() * 600))
        const [input, output] = TOKENS[req.model]
        let content: string
        if (req.systemPrompt?.includes("Chairman of an AI advisory council")) {
          content = CHAIRMAN_ANSWER
        } else if (req.systemPrompt?.includes("critique round")) {
          content = CRITIQUE_TEMPLATE(
            ["A", "B", "C", "D"][Math.floor(Math.random() * 4)]
          )
        } else {
          content = ROUND_ONE[req.model]
        }
        const outTokens = Math.round(output * (0.9 + Math.random() * 0.2))
        return {
          content,
          usage: {
            inputTokens: input,
            outputTokens: outTokens,
            totalTokens: input + outTokens,
            cachedInputTokens: Math.round(input * 0.3),
            reasoningTokens: null,
            rawUsage: { prompt_tokens: input, completion_tokens: outTokens },
          },
          providerRequestId: `demo-${Math.random().toString(36).slice(2, 10)}`,
          finishReason: "stop",
        }
      },
    })
  }

  const question = "名留是否應該投資越南 Salon？"

  console.log("Running demo council (mock providers)…")
  const session = await db.session.create({
    data: { title: question, mode: "COUNCIL" },
  })
  const message = await db.message.create({
    data: {
      sessionId: session.id,
      role: "USER",
      source: "USER",
      content: question,
    },
  })
  const run = await db.councilRun.create({
    data: {
      sessionId: session.id,
      userMessageId: message.id,
      chairmanProvider: "OPENAI",
      chairmanModel: "gpt-5.1",
    },
  })

  await runCouncil(
    {
      runId: run.id,
      sessionId: session.id,
      question,
      models: MODELS,
      chairman: { provider: "OPENAI", modelId: "gpt-5.1" },
    },
    { db, registry }
  )

  const final = await db.councilRun.findUniqueOrThrow({ where: { id: run.id } })
  console.log(
    `Council ${final.status}: ${final.totalTokens} tokens, $${final.totalCostUsd}`
  )

  // A couple of solo chats so History and Usage have variety.
  console.log("Adding demo solo chats…")
  for (const m of MODELS.slice(0, 3)) {
    const s = await db.session.create({
      data: { title: `今年冬季的髮色趨勢有哪些？`, mode: "SOLO" },
    })
    await db.message.create({
      data: {
        sessionId: s.id,
        role: "USER",
        source: "USER",
        content: "今年冬季的髮色趨勢有哪些？",
      },
    })
    const outcome = await executeModelRun(
      {
        sessionId: s.id,
        provider: m.provider,
        modelId: m.modelId,
        stage: "SOLO",
        messages: [{ role: "user", content: "今年冬季的髮色趨勢有哪些？" }],
      },
      { db, registry }
    )
    if (outcome.response) {
      await db.message.create({
        data: {
          sessionId: s.id,
          role: "ASSISTANT",
          source: "MODEL",
          content: outcome.response.content,
          modelRunId: outcome.modelRunId,
        },
      })
    }
  }

  // One failed call so the dashboard shows a non-100% success rate.
  const failSession = await db.session.create({
    data: { title: "Rate limit demo", mode: "SOLO" },
  })
  const failRegistry = new ProviderRegistry()
  failRegistry.register({
    provider: "XAI",
    async generate() {
      throw new ProviderError("429 Too Many Requests", {
        code: "RATE_LIMITED",
        httpStatus: 429,
        retryable: false,
      })
    },
  })
  await executeModelRun(
    {
      sessionId: failSession.id,
      provider: "XAI",
      modelId: "grok-4",
      stage: "SOLO",
      messages: [{ role: "user", content: "demo" }],
    },
    { db, registry: failRegistry }
  )

  console.log("Demo data ready.")
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await db.$disconnect()
    process.exit(1)
  })
