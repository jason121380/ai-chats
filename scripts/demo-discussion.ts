/**
 * Local UI preview only. Runs a group Discussion with MOCK providers so the
 * chat transcript has realistic content without spending anything.
 * Not part of the app; safe to delete.
 */
import { PrismaClient, type ProviderName } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

import { ProviderRegistry } from "../src/server/ai/registry"
import { runDiscussion } from "../src/server/council/discussion"
import type { AIRequest, AIResponse } from "../src/server/ai/types"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter })

const PARTICIPANTS: Array<{ provider: ProviderName; modelId: string }> = [
  { provider: "OPENAI", modelId: "gpt-5.1" },
  { provider: "ANTHROPIC", modelId: "claude-sonnet-4-5" },
  { provider: "GOOGLE", modelId: "gemini-2.5-pro" },
  { provider: "XAI", modelId: "grok-4" },
]

const QUESTION = "名留是否應該投資越南 Salon？我要聽你們吵一架，不要各說各話。"

// round -> modelId -> what they say
const SCRIPT: Record<number, Record<string, string>> = {
  1: {
    "gpt-5.1": `我先開個頭，講結論：**值得進，但不是明年**。

越南都市化速度快，胡志明市 25-35 歲女性的可支配所得年增接近兩位數，而美髮連鎖化程度極低，多數還是單店。這個結構跟台灣二十年前很像，而我們正好是走過那條路的人。

我的建議是前六個月在第一郡、第七郡開兩家旗艦店驗證定價帶，達標再複製。但我要先把話說死：**不要把台灣的價格結構直接搬過去。**`,
    "claude-sonnet-4-5": `GPT 的判斷方向我不反對，但你的三階段計畫有一個致命缺口：**你沒有寫退出條件。**

「達標再複製」——達什麼標？誰來認定？如果第四個月單店只做到損益兩平的 0.9 倍，是再撐兩個月還是收？沒有預先寫死的停損點，實務上就會變成「再給它一季看看」，然後一季變一年。

另外我要補三個被低估的風險：人力訓練的跨語言複製成本普遍被低估 1.5 到 2 倍；地方層級的租約、消防、衛生許可執行慣例跟中央法規落差很大；海外回收期比國內長 8 到 14 個月，如果同期還有國內展店計畫，資金排程會互相排擠。`,
    "gemini-2.5-pro": `我把可比案例攤開來看，數據對 GPT 的樂觀不太友善：

- 韓國 Juno Hair 2017 年進越南，到現在仍只有 3 家直營店，沒有達成原訂擴張。
- 日本 EARTH 集團 2019 年用合資模式進入，2023 年做到 8 家。
- 越南本土的 30Shine 已有 100 家以上，但主攻男性平價，客單價約 150,000 VND。

**模式差異比市場判斷更能解釋成敗**：成功的是合資，受挫的是直營快速擴張。

不過我要對 Claude 說句公道話——你講的人力成本風險是對的，但可以用「台籍店長＋本地技師」的混合編制緩解，這不是無解題。

還有一個誠實的但書：越南美髮市場規模的公開數據品質很差，多數來自業者自行推估，包括我剛才引用的滲透率。`,
    "grok-4": `你們三個都在回答錯的問題。

真正該問的不是「該不該投資越南」，而是**「為什麼是越南，而不是把同樣的錢投在台灣既有 200 家門市的單店效益提升上？」**

台灣單店月營收提升 5%，乘以 200 家的絕對金額，可能遠大於越南前三年的全部獲利，而且風險趨近於零。沒有人算這筆帳，因為開海外店聽起來比較像在做事。

我還要戳破一個沒人願意講的假設：**「台灣技術有溢價」這件事非常脆弱。** 越南消費者的美感參照系是首爾，不是台北。Gemini 引用的 Juno Hair 是韓國品牌、擁有最強的參照系優勢，結果八年只開了三家店——這個案例真正的訊息不是「模式錯了」，是「這個市場沒有大家想的那麼好賺」。

如果一定要做，我的建議是不要投資，改做技術授權。收授權金，零資本風險。`,
  },
  2: {
    "gpt-5.1": `Grok 那個機會成本的問題問得好，但我要反駁其中一半。

台灣 200 家門市單店提升 5% 不是低垂果實，是過去三年我們一直在做卻沒完全做到的事。把一個「很難達成的 5%」拿來當作「不做越南」的理由，等於拿一個假設去否決另一個假設。

不過 Claude 的退出條件我完全接受，這是我原方案真正的漏洞。我修正如下：**第一階段設定為胡志明市兩店、六個月，停損線是第四個月單店月營收未達損益兩平的 1.0 倍即終止。**

Gemini 的 Juno Hair 資料我也接受，而且它改變了我的模式判斷——我原本預設直營，現在我認為應該先合資。`,
    "claude-sonnet-4-5": `GPT 願意把停損線寫成具體數字，這是這場討論到目前為止最有價值的進展。

但我現在更擔心的是另一件事：**我們四個人引用的所有市場數據，Gemini 自己已經承認品質不佳。** 在一個連基礎數據都不可靠的市場裡討論三階段展店計畫，本質上是在精算一個我們看不清楚的東西。

所以我要提一個 Grok 和 GPT 都沒說的第三條路：**先花三個月、200 萬台幣做實地市場驗證。** 訪談 30 位目標客群、10 家本地高端沙龍，把「台灣技術溢價是否成立」這個問題直接問出來。這筆錢相對展店資本極小，但它消除的正是我們吵了兩輪都吵不出結論的那個核心不確定性。`,
    "gemini-2.5-pro": `我支持 Claude 的驗證方案，而且我可以把它變得更具體。

需要驗證的不是一個模糊的「溢價接受度」，是一個可以證偽的數字：**目標客群願意為台灣技術付出的價格，是否達到本地高端沙龍的 1.2 倍以上。** 低於 1.2 倍，整個定價模型不成立，直接否決；1.2 到 1.4 倍之間，走合資；超過 1.4 倍才值得考慮直營。

另外回應 Grok 對 Juno Hair 的解讀——你說韓國品牌有最強參照系優勢卻只開三家，所以是市場不好賺。但我查到的另一個訊息是 Juno Hair 在越南走的是高價直營，客單價訂在本地高端的 2 倍以上。所以那個案例同時支持你的「溢價脆弱」論和我的「模式錯誤」論，我們兩個都對，只是講的是同一件事的兩面。`,
    "grok-4": `好，我讓步一半。

Claude 的驗證方案我支持，因為它便宜。200 萬對比展店資本是雜訊等級的支出，而它消除的不確定性是這場討論的整個爭點。這是唯一一個我們四個人都無法用推理解決、只能用事實解決的問題。

我讓步的是「不要投資」這個結論——我現在認為是「還不要投資」。

但我保留另一半：**如果驗證結果是 1.2 到 1.4 倍那個模糊地帶，我仍然主張技術授權而不是合資。** 因為在那個溢價水準下，合資的資本投入與報酬不成比例，而授權模式的下檔風險是零。Gemini 的三段式門檻裡，中間那段我認為他配錯了工具。

還有一件事沒人講：我們討論了兩輪越南，**沒有任何人問過名留在越南有沒有可信的在地合作夥伴。** 沒有夥伴，合資就只是一句話。`,
  },
}

const SUMMARY = `## Executive Summary

四位參與者從對立開始，最後收斂到一個所有人都能接受的方案：**不直接投資展店，先執行三個月、約新台幣 200 萬元的市場驗證專案**，再依驗證結果在合資與技術授權之間選擇。這個共識不是妥協，是討論中真正被證明的東西——所有分歧都指向同一個可驗證的事實問題。

## Where They Agreed

GPT-5.1 與 Gemini 2.5 Pro 都認同越南中高端女性美髮市場的連鎖滲透率偏低；四人一致同意平價男性市場已被 30Shine 佔據，不應進入。在第二輪中，**GPT-5.1 接受了 Claude Sonnet 4.5 提出的停損條件**，並因 Gemini 提出的 Juno Hair 案例把原本的直營主張改為合資；**Grok 4 也從「不要投資」讓步為「還不要投資」**，並支持 Claude 的驗證方案。四人最終都接受先驗證再決策。

## Where They Disagreed

**機會成本之爭尚未解決。** Grok 4 主張同樣資本投入台灣 200 家既有門市的單店效益提升，風險趨近於零；GPT-5.1 反駁 5% 的單店提升是過去三年做不到的事，拿一個假設否決另一個假設不成立。這一點雙方都有道理，討論中未能裁決。

**驗證結果落在中間地帶時該做什麼，仍有分歧。** Gemini 2.5 Pro 提出三段式門檻（低於 1.2 倍否決、1.2-1.4 倍合資、高於 1.4 倍考慮直營）；Grok 4 明確反對中間那段，主張 1.2-1.4 倍應走技術授權而非合資，理由是該溢價水準下合資的資本投入與報酬不成比例。

## Key Risks

**數據基礎不可靠**（高影響、已確認）。Gemini 2.5 Pro 主動承認自己引用的越南市場滲透率來自業者自行推估，Claude Sonnet 4.5 隨即指出：在連基礎數據都不可信的市場裡精算三階段展店計畫，本質上是在精算看不清楚的東西。這是整場討論中最重要的自我修正。

**台灣技術溢價假設脆弱**（高影響、中機率）。Grok 4 指出越南消費者的美感參照系是首爾而非台北，並以 Juno Hair 八年僅三家店佐證。Gemini 2.5 Pro 補充該案例走的是本地高端 2 倍以上的高價直營，因此該案例同時支持「溢價脆弱」與「模式錯誤」兩種解讀。

**缺乏在地合作夥伴**（高影響、未評估）。Grok 4 在討論最後指出：四人談了兩輪合資，沒有任何人問過名留在越南是否有可信的在地夥伴。沒有夥伴，合資只是一句話。這是整場討論中唯一被提出卻完全未被處理的風險。

**人力訓練成本超支**（中影響、高機率）。Claude Sonnet 4.5 指出跨語言 SOP 複製成本普遍被低估 1.5 至 2 倍；Gemini 2.5 Pro 認為可用台籍店長加本地技師的混合編制緩解，並非無解。

## Recommended Decision

**執行三個月市場驗證專案，暫緩一切展店決策。**

理由是討論本身證明出來的：四人的分歧在第二輪全部收斂到同一個可驗證的事實問題——目標客群對台灣技術的溢價接受度。這個問題用 200 萬元、三個月可以直接問出答案，而錯誤的展店決策代價是數千萬元與兩年時間。在不確定性可以被便宜地消除時，先消除它。

採用 Gemini 2.5 Pro 提出的可證偽門檻作為決策判準，但將 Grok 4 對中間地帶的異議明確記錄為待決事項，而非在此裁決。

## Action Plan

| 時程 | 行動 | 負責 | 成功判準 |
|---|---|---|---|
| 第 1 個月 | 胡志明市第一郡、第七郡實地走訪，訪談 30 位目標客群、10 家本地高端沙龍 | 事業發展 | 取得溢價接受度區間 |
| 第 1 個月 | **盤點越南在地潛在合作夥伴**（討論中被指出的缺口） | 執行副總 | 名單與初步接觸紀錄 |
| 第 1-2 個月 | 確認地方層級租約、消防、衛生許可實務慣例 | 法務 | 書面法規清單 |
| 第 2 個月 | 人力成本建模：台籍店長＋本地技師混合編制 | 營運 | 三年人力成本模型 |
| 第 3 個月 | 決策會議 | 董事會 | 依門檻做出明確決議 |

**停損條件：** 溢價接受度低於本地高端沙龍的 1.2 倍，直接終止，不進入越南。

**待決事項：** 若落在 1.2-1.4 倍區間，合資或技術授權需另行決議——這是討論中唯一未收斂的分歧。

## Confidence

**Medium-High。**

比一般情況有信心，因為這個結論不是我歸納出來的，是四位參與者在互相反駁的過程中自己收斂出來的——GPT-5.1 修正了兩次立場，Grok 4 讓步了一半，兩人都是被具體論證說服而非被多數意見淹沒。這種收斂比一致同意更有說服力。

信心不到 High 的原因有兩個：市場數據品質不佳這件事是參與者自己承認的，而在地合作夥伴的問題整場討論都沒有被處理。

**會改變我判斷的資訊：** 若名留在越南已有可信的在地合作夥伴且對方願意承擔部分資本，驗證階段可與合資談判平行進行，不必嚴格序列化。`

async function main() {
  const registry = new ProviderRegistry()
  const TOKENS: Record<string, [number, number]> = {
    "gpt-5.1": [2100, 980],
    "claude-sonnet-4-5": [2100, 1120],
    "gemini-2.5-pro": [2100, 1340],
    "grok-4": [2100, 1260],
  }

  for (const p of PARTICIPANTS) {
    registry.register({
      provider: p.provider,
      async generate(req: AIRequest): Promise<AIResponse> {
        await new Promise((r) => setTimeout(r, 150 + Math.random() * 400))
        let content: string
        if (req.systemPrompt?.includes("closing summary")) {
          content = SUMMARY
        } else {
          const round = req.systemPrompt?.includes("speaking round 2") ? 2 : 1
          content = SCRIPT[round]?.[req.model] ?? "…"
        }
        const [input, outBase] = TOKENS[req.model]
        const output = Math.round(outBase * (0.9 + Math.random() * 0.2))
        return {
          content,
          usage: {
            inputTokens: input,
            outputTokens: output,
            totalTokens: input + output,
            cachedInputTokens: Math.round(input * 0.35),
            reasoningTokens: null,
            rawUsage: { prompt_tokens: input, completion_tokens: output },
          },
          providerRequestId: `demo-${Math.random().toString(36).slice(2, 10)}`,
          finishReason: "stop",
        }
      },
    })
  }

  const session = await db.session.create({
    data: { title: QUESTION, mode: "DISCUSSION" },
  })
  const message = await db.message.create({
    data: {
      sessionId: session.id,
      role: "USER",
      source: "USER",
      content: QUESTION,
    },
  })
  const run = await db.councilRun.create({
    data: {
      sessionId: session.id,
      userMessageId: message.id,
      kind: "DISCUSSION",
      totalRounds: 2,
      chairmanProvider: "OPENAI",
      chairmanModel: "gpt-5.1",
    },
  })

  console.log("Running demo discussion (mock providers)…")
  await runDiscussion(
    {
      runId: run.id,
      sessionId: session.id,
      question: QUESTION,
      participants: PARTICIPANTS,
      rounds: 2,
      style: "COLLABORATIVE",
      summarizer: { provider: "OPENAI", modelId: "gpt-5.1" },
    },
    { db, registry }
  )

  const final = await db.councilRun.findUniqueOrThrow({ where: { id: run.id } })
  console.log(
    `Discussion ${final.status}: ${final.totalTokens} tokens, $${final.totalCostUsd}`
  )
  console.log(`Session: ${session.id}`)
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await db.$disconnect()
    process.exit(1)
  })
