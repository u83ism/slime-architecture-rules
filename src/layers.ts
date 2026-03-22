/**
 * Slime Architecture のレイヤーファイル名・フォルダ名の定数。
 * Kaachan（静的解析）および Slime FW（スキャフォールド・ルーティング）双方で参照する。
 */

/** ルートレベル（src/ 直下）に置くファイル名 */
export const LAYER_FILES = {
  ROUTE: "route.ts",
  WORKFLOW: "workflow.ts",
  MIDDLEWARE: "middleware.ts",
  PARSE: "parse.ts",
  REPOSITORY: "repository.ts",
  CLIENT: "client.ts",
  LOGIC: "logic.ts",
  PORTS: "ports.ts",
} as const

export type LayerFile = (typeof LAYER_FILES)[keyof typeof LAYER_FILES]

/** フォルダ名・プレフィックス */
export const FOLDER_NAMES = {
  LOGIC: "logic",
  APP: "app",
  SHARED: "shared",
  INFRASTRUCTURE: "infrastructure",
  COMMAND: "command",
  QUERY: "query",
} as const

export type FolderName = (typeof FOLDER_NAMES)[keyof typeof FOLDER_NAMES]

/** 特殊なフォルダのプレフィックス・パターン */
export const FOLDER_PATTERNS = {
  /** ドメインフォルダ: domainXxx 形式（例: domainUser） */
  DOMAIN: /^domain[A-Z]/,
  /** クロスフォルダ: cross- プレフィックス（例: cross-auth） */
  CROSS_PREFIX: "cross-",
} as const

/** shared/events.ts のパス断片 */
export const SHARED_EVENTS_FILE = "events.ts"
