/**
 * 介面文案（繁體中文）。
 *
 * 集中管理，避免字串散落在各個元件裡。未來要支援多語系時，
 * 這個檔案是唯一需要複製的東西。
 *
 * 命名原則：以「使用者看到的東西」分組，不以元件檔名分組——
 * 同一句話可能出現在多個元件。
 */

export const t = {
  app: {
    name: "AI 議會",
    tagline: "多模型決策",
  },

  nav: {
    newChat: "新對話",
    council: "議會",
    history: "歷史紀錄",
    usage: "用量",
    settings: "設定",
    councilHint: "議會 · 獨立分析 → 匿名互評 → 主席裁決",
    discussionHint: "討論 · 全員同場輪流發言",
  },

  mode: {
    council: "議會",
    councilHint: "先各自獨立分析，再匿名互評。避免互相影響。",
    discussion: "圓桌討論",
    discussionHint: "全員在同一個房間輪流發言，看得到彼此並互相回應。",
  },

  council: {
    title: "召開議會",
    subtitle: "每個模型獨立分析，匿名互評後由主席做出裁決。",
    discussionTitle: "圓桌討論",
    discussionSubtitle: "模型輪流發言，看得到彼此，把問題吵清楚。",
    questionPlaceholder: "例如：我們明年是否應該投資越南的 Salon 市場？",
    questionPlaceholderDiscussion:
      "例如：我們明年是否應該投資越南的 Salon 市場？讓他們吵一架。",
    members: "議會成員",
    participants: "與會者",
    chairman: "主席",
    summarizer: "總結撰寫者",
    selectChairmanPlaceholder: "選擇主席模型",
    rounds: "發言輪數",
    withSummary: "產出總結",
    start: "開始議會",
    startDiscussion: "開始討論",
    running: "議會進行中…",
    runningDiscussion: "會議進行中…",
    roundsEstimate: (participants: number, rounds: number) =>
      `${participants} 位與會者 × ${rounds} 輪 = ${participants * rounds} 則發言`,
    stage: (stage: string) => `階段：${stage}`,
    roundProgress: (current: number, total: number) =>
      `第 ${current} 輪，共 ${total} 輪`,
    starting: "啟動中…",
  },

  discussion: {
    join: "加入討論",
    composerHint: "插話…（目前這位講完後，下一位會回應你）",
    composerClosed: "討論已結束，無法再發言。",
    summary: "會議總結",
    summaryPending: "討論結束後才會有總結。",
  },

  transcript: {
    you: "你",
    round1: "第一輪",
    round1Hint: "各自獨立作答，看不到其他人",
    critique: "第二輪 · 交叉互評",
    critiqueHint: "匿名進行，彼此不知道誰是誰",
    round: (n: number) => `第 ${n} 輪`,
    roundOpening: "開場立場",
    roundFinal: "最終立場",
    roundMiddle: "互相回應",
    chairman: "主席",
    closingSummary: "會議總結",
    finalRecommendation: "最終建議",
    typing: "輸入中",
    noContent: "（沒有回傳內容）",
    failedTitle: "無法回應",
    timeoutTitle: "逾時，沒有回應",
    failedHint: "會議在沒有這則發言的情況下繼續進行。",
    viewResponse: "查看回應",
    hideResponse: "收合回應",
  },

  stats: {
    messages: "發言數",
    calls: "呼叫次數",
    tokens: "Token",
    cost: "花費",
    wallTime: "總耗時",
    latency: "延遲",
    inOutTokens: "輸入 / 輸出",
    attempts: (n: number) => `重試 ${n} 次`,
    noPrice: "未設定價格",
  },

  chat: {
    title: "新對話",
    subtitle: "與單一模型對話，或讓多個模型同題並列比較。",
    solo: "單一對話",
    compare: "並列比較",
    selectModel: "選擇模型",
    newConversation: "開新對話",
    emptyState: "問點什麼——對話內容與完整用量帳本都存在 PostgreSQL。",
    inputPlaceholder: "輸入訊息…",
    send: "送出",
    thinking: "思考中…",
    comparePlaceholder: "同一個問題，同時問多個模型…",
    compare_: "開始比較",
  },

  history: {
    title: "歷史紀錄",
    subtitle: "每一場對話的 Token 與花費，全部來自 ModelRun 帳本。",
    empty: "還沒有任何對話。",
    colTitle: "標題",
    colMode: "模式",
    colCalls: "呼叫次數",
    colTokens: "Token",
    colCost: "花費",
    colUpdated: "更新時間",
    conversation: "對話內容",
    noMessages: "沒有訊息。",
    councilRuns: "議會紀錄",
    otherCalls: "其他模型呼叫",
    modelCalls: (n: number) => `${n} 次模型呼叫`,
    costBreakdown: "花費明細",
    costBreakdownDiscussion: "討論花費明細",
    total: "合計",
  },

  usage: {
    title: "用量",
    subtitle: "Token、花費與延遲分析，資料來自 ModelRun 計費帳本。",
    today: "今日",
    days7: "近 7 天",
    days30: "近 30 天",
    custom: "自訂",
    to: "至",
    totalSpend: "總花費",
    totalTokens: "總 Token",
    totalCalls: "總呼叫",
    successful: "成功",
    failed: "失敗",
    avgLatency: "平均延遲",
    colModel: "模型",
    colProvider: "供應商",
    colCalls: "呼叫",
    colInput: "輸入 Token",
    colOutput: "輸出 Token",
    colCached: "快取",
    colReasoning: "推理",
    colTotal: "總 Token",
    colCost: "花費",
    colAvgCost: "平均每次",
    colAvgLatency: "平均延遲",
    colSuccessRate: "成功率",
    emptyRange: "這段期間沒有任何模型呼叫。",
  },

  settings: {
    addModel: "新增模型",
    addModelHint: "從各家近期的模型挑一個，或直接填入模型 ID。",
    recentModels: "近期模型",
    alreadyAdded: "已在清單",
    modelIdLabel: "模型 ID",
    modelIdPlaceholder: "例如 gpt-5.6-luna",
    modelIdHint:
      "送給供應商的字串就是這個。清單沒有的新模型可以直接填，不必等更新。",
    displayNameLabel: "顯示名稱",
    addErrorNoId: "請選一個模型或填入模型 ID",
    adding: "新增中…",
    cancel: "取消",
    title: "設定",
    subtitle:
      "模型設定與價格。價格採唯讀累加，歷史 ModelRun 的價格快照永不被改寫。",
    tabModels: "模型",
    tabPricing: "價格",
    colProvider: "供應商",
    colModel: "模型",
    colEnabled: "啟用",
    colRole: "議會角色",
    colTemperature: "Temperature",
    colMaxOutput: "最大輸出",
    colPricing: "價格",
    colApiKey: "API Key",
    pricingConfigured: "已設定",
    pricingMissing: "未設定",
    apiKeyPresent: "已提供",
    apiKeyMissing: "缺少",
    noModels: "尚未設定任何模型。點右上角「新增模型」加入。",
    colInputPer: "輸入 / 1M",
    colOutputPer: "輸出 / 1M",
    colCachedPer: "快取 / 1M",
    colReasoningPer: "推理 / 1M",
    colEffective: "生效期間",
    colStatus: "狀態",
    active: "生效中",
    historical: "歷史",
    now: "目前",
    noPricing: "尚未設定價格。可透過 seed 或 POST /api/pricing 新增。",
  },

  errors: {
    enterQuestion: "請先輸入問題。",
    selectModel: "請至少選擇一個模型。",
    selectTwo: "圓桌討論至少需要兩位與會者。",
    selectChairman: "請選擇主席。",
    selectSummarizer: "請選擇總結撰寫者，或關閉總結功能。",
    startFailed: "啟動失敗",
    requestFailed: "請求失敗",
    loadModels: "無法載入模型清單",
    loadSessions: "無法載入對話紀錄",
    loadSession: "無法載入這場對話",
    loadUsage: "無法載入用量資料",
    loadPricing: "無法載入價格資料",
    noEnabledModels: "沒有已啟用的模型。請到「設定」啟用模型並執行 seed。",
    noApiKey: "無 API Key",
    unknown: "未知錯誤",
  },

  status: {
    PENDING: "等待中",
    RUNNING: "進行中",
    COMPLETED: "已完成",
    PARTIAL: "部分完成",
    FAILED: "失敗",
    TIMEOUT: "逾時",
    CANCELLED: "已取消",
    ROUND_1: "第一輪",
    CRITIQUE: "互評中",
    CHAIRMAN: "主席裁決中",
    DISCUSSING: "討論中",
  } as Record<string, string>,

  mode_: {
    SOLO: "單一對話",
    COMPARE: "並列比較",
    COUNCIL: "議會",
    DISCUSSION: "圓桌討論",
    BATTLE: "對戰",
  } as Record<string, string>,

  kind: {
    COUNCIL: "議會",
    DISCUSSION: "圓桌討論",
  } as Record<string, string>,

  source: {
    USER: "你",
    MODEL: "模型",
    CHAIRMAN: "主席",
    SYSTEM: "系統",
  } as Record<string, string>,

  stage: {
    SOLO: "單一對話",
    COMPARE: "並列比較",
    ROUND_1: "第一輪",
    CRITIQUE: "互評",
    CHAIRMAN: "主席",
    DISCUSSION: "討論",
  } as Record<string, string>,
} as const

/** 狀態代碼轉中文，未知代碼原樣顯示。 */
export function statusLabel(status: string): string {
  return t.status[status] ?? status
}

export function modeLabel(mode: string): string {
  return t.mode_[mode] ?? mode
}

export function stageLabel(stage: string): string {
  return t.stage[stage] ?? stage
}

export function kindLabel(kind: string): string {
  return t.kind[kind] ?? kind
}

export function sourceLabel(source: string): string {
  return t.source[source] ?? source
}

/** 台灣慣用的日期時間格式。 */
export const LOCALE = "zh-TW"

export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString(LOCALE, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString(LOCALE)
}

export function formatTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}
