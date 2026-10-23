/**
 * Slime Architecture のアーキテクチャレベル定義（Lv1〜Lv10）。
 */

export type ArchitectureLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export interface LevelDefinition {
  readonly level: ArchitectureLevel
  /** 短い名称（例: "Routing Only"） */
  readonly name: string
  /** このレベルの概要 */
  readonly description: string
  /**
   * このレベルに到達していることを示すファイル/フォルダの一覧（人間向けラベル）。
   * Kaachan の evidence 表示や Slime FW の診断メッセージに使う。
   */
  readonly evidenceLabel: string
  /**
   * 次のレベルへ進むために必要なファイル名の一覧。
   * scanner.ts が参照する定数と対応させる。
   */
  readonly requiredFilesForNext: readonly string[]
  /** 次のレベルへ進むために必要なフォルダ名の一覧 */
  readonly requiredFoldersForNext: readonly string[]
}

export const LEVEL_DEFINITIONS: readonly LevelDefinition[] = [
  {
    level: 1,
    name: "Routing Only",
    description: "route.ts にルーティングのみを持つ最小構成。",
    evidenceLabel: "route.ts",
    requiredFilesForNext: ["workflow.ts", "middleware.ts"],
    requiredFoldersForNext: [],
  },
  {
    level: 2,
    name: "Workflow + Middleware",
    description: "ビジネスフロー（workflow.ts）とミドルウェア（middleware.ts）を分離した構成。",
    evidenceLabel: "workflow.ts, middleware.ts",
    requiredFilesForNext: ["parse.ts"],
    requiredFoldersForNext: [],
  },
  {
    level: 3,
    name: "Parse Layer",
    description: "リクエストのバリデーション・変換を parse.ts に切り出した構成。",
    evidenceLabel: "parse.ts",
    requiredFilesForNext: ["store.ts", "client.ts"],
    requiredFoldersForNext: [],
  },
  {
    level: 4,
    name: "Store + Client",
    description: "永続化（store.ts）と外部通信（client.ts）を分離した構成。",
    evidenceLabel: "store.ts, client.ts",
    requiredFilesForNext: ["logic.ts or logic/ folder"],
    requiredFoldersForNext: [],
  },
  {
    level: 5,
    name: "Logic Layer",
    description: "ドメインロジックを logic.ts または logic/ フォルダに切り出した構成。",
    evidenceLabel: "logic.ts or logic/",
    requiredFilesForNext: [],
    requiredFoldersForNext: ["app/", "shared/", "domain<Name>/"],
  },
  {
    level: 6,
    name: "Domain Folders",
    description: "app/, shared/, domainXxx/ によるドメイン分割構成。ドメイン間の依存は宣言した DAG に従う。",
    evidenceLabel: "app/, shared/, domain folder",
    requiredFilesForNext: [],
    requiredFoldersForNext: ["orchestrate-<name>/"],
  },
  {
    level: 7,
    name: "Orchestrate Folders",
    description: "複数ドメインをまたぐ調整を orchestrate- プレフィックスフォルダに切り出した構成。",
    evidenceLabel: "orchestrate- prefixed folder",
    requiredFilesForNext: ["shared/events.ts"],
    requiredFoldersForNext: [],
  },
  {
    level: 8,
    name: "Shared Events",
    description: "ドメイン間のイベント定義を shared/events.ts に集約した構成。",
    evidenceLabel: "shared/events.ts",
    requiredFilesForNext: ["ports.ts in domain folder"],
    requiredFoldersForNext: ["infrastructure/"],
  },
  {
    level: 9,
    name: "Ports & Adapters",
    description: "Ports & Adapters パターンを導入し、infrastructure/ と ports.ts でインフラ境界を明確化した構成。",
    evidenceLabel: "infrastructure/, ports.ts in domain",
    requiredFilesForNext: [],
    requiredFoldersForNext: ["command/ and query/ in domain folder"],
  },
  {
    level: 10,
    name: "CQRS",
    description: "ドメインフォルダに command/ と query/ を分割した CQRS 構成。",
    evidenceLabel: "command/ and query/ in domain",
    requiredFilesForNext: [],
    requiredFoldersForNext: [],
  },
] as const

/** レベル番号から LevelDefinition を引くユーティリティ */
export const getLevelDefinition = (level: ArchitectureLevel): LevelDefinition => {
  const def = LEVEL_DEFINITIONS.find((d) => d.level === level)
  if (def === undefined) throw new Error(`Unknown level: ${level}`)
  return def
}
