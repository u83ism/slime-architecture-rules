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

/**
 * 層ファイルを置く場所（src/ からの相対パス。`*` は任意の1フォルダ）と、そこで認識されるファイル名。
 * Slime FW はこの名前でファイルを見つけ、Kaachan はこの名前で到達Lvを判定する。
 * 名前を書き間違えると、FWに認識されず、Lvの判定もずれる。
 *
 * - 全Lvの和集合で持つ。そのLvでまだ早い・もう不要なファイル（Lv6の ports.ts、Lv9の store.ts 等）は別のルールが扱う
 * - ここに無い場所（logic/・parse/・query/・infrastructure/ の中、利用者が作った任意のフォルダ）はファイル名が自由で、検査しない
 * - テストファイル（`*.test.ts`・`*.spec.ts`）は接尾辞を除いた名前で誤字だけを見る
 *
 * Kaachan の `layer-file-typo` / `layer-file-unknown` が参照する。
 */
export const RECOGNIZED_FILES: readonly { readonly path: string; readonly files: readonly string[] }[] = [
  {
    // Lv1〜5。index.ts・main.ts・server.ts は他FW（Hono・Express等）で使うときの起動ファイル
    path: "",
    files: ["route.ts", "middleware.ts", "workflow.ts", "parse.ts", "errors.ts", "store.ts", "client.ts", "logic.ts", "index.ts", "main.ts", "server.ts"],
  },
  { path: "app", files: ["route.ts", "workflow.ts", "parse.ts", "middleware.ts"] },
  { path: "shared", files: ["utility.ts", "smallLogic.ts", "store.ts", "events.ts"] },
  { path: "client", files: ["client.ts", "adapter.ts"] },
  { path: "domains/*", files: ["routes.ts", "parse.ts", "errors.ts", "workflow.ts", "logic.ts", "store.ts", "ports.ts"] },
  { path: "domains/*/command", files: ["workflow.ts", "ports.ts", "logic.ts"] },
  { path: "orchestrate/*", files: ["workflow.ts"] },
]

/**
 * `layer-file-typo` の「近い名前」の基準。
 * 拡張子を除き、大文字小文字と `-`・`_` を無視して比べ、Damerau–Levenshtein 距離がこの値以下なら誤字とみなす。
 * 短い名前（6文字以下）は1、それより長い名前は2（短い名前で2まで許すと logs→logic、mirrors→errors のような別の語まで拾うため）。
 * 層ファイルの置き場所にある login.ts（logic と距離1）は拾うが、層ファイルの置き場所に置くべき名前でもないので、置き場所の見直しを促せばよい。
 */
export const LAYER_FILE_TYPO_DISTANCE = { SHORT_NAME_MAX_LENGTH: 6, SHORT: 1, LONG: 2 } as const
