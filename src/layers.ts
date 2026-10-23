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
  STORE: "store.ts",
  CLIENT: "client.ts",
  LOGIC: "logic.ts",
  PORTS: "ports.ts",
  ERRORS: "errors.ts",
} as const

export type LayerFile = (typeof LAYER_FILES)[keyof typeof LAYER_FILES]

/** フォルダ名 */
export const FOLDER_NAMES = {
  LOGIC: "logic",
  APP: "app",
  SHARED: "shared",
  CLIENT: "client",
  INFRASTRUCTURE: "infrastructure",
  COMMAND: "command",
  QUERY: "query",
  /** ドメインの親フォルダ（Lv6〜）。直下の各フォルダが1つのドメイン（例: domains/user） */
  DOMAINS: "domains",
  /** 調整役の親フォルダ（Lv7〜）。直下の各フォルダが1つの調整役（例: orchestrate/order-inventory） */
  ORCHESTRATE: "orchestrate",
} as const

export type FolderName = (typeof FOLDER_NAMES)[keyof typeof FOLDER_NAMES]

/** フォルダ名のパターン */
export const FOLDER_PATTERNS = {
  /** domains/・orchestrate/ 直下のフォルダ名: kebab-case（例: user, order-item） */
  KEBAB_CASE: /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
} as const

/** shared/events.ts のパス断片 */
export const SHARED_EVENTS_FILE = "events.ts"
