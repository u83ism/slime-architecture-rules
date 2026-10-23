/**
 * エラー応答の形式（Problem Details, RFC 9457）と、FW が自動で返すエラーコード。
 *
 * - 業務上の拒否（DomainError）は、アプリが宣言したエラーコードを `code` に入れて 4xx で返す
 * - 下の BUILT_IN_ERROR_CODES は、parse 失敗・Middleware 拒否・未捕捉 throw のときに FW が使うコード
 * - フロントエンドは `import type` でこの型とアプリのエラーコードの union を取り込み、文言の対応表を網羅させられる
 */

export const PROBLEM_DETAILS_CONTENT_TYPE = "application/problem+json"

/** FW が自動で返すエラーコードと HTTP ステータス。アプリのエラーコードはこれらと重複させない */
export const BUILT_IN_ERROR_CODES = {
  /** parse 失敗 */
  INVALID_INPUT: 400,
  /** 認証されていない（Middleware） */
  UNAUTHENTICATED: 401,
  /** ロール単位の認可で拒否（Middleware） */
  FORBIDDEN: 403,
  /** レートリミット（Middleware） */
  RATE_LIMITED: 429,
  /** 未捕捉の throw（技術的な障害）。詳細は応答に含めない */
  INTERNAL_ERROR: 500,
} as const

export type BuiltInErrorCode = keyof typeof BUILT_IN_ERROR_CODES

/** parse 失敗時に、どの入力がなぜ不正かを伝える項目 */
export interface InvalidParam {
  readonly path: string
  readonly reason: string
}

/** Problem Details（RFC 9457）に、拡張メンバー code を加えたエラー応答 */
export interface ProblemDetails<Code extends string = string> {
  /** 問題の種類を表す URI。独自の種類を定義しない場合は "about:blank" */
  readonly type: string
  /** HTTP ステータスに対応する短い説明（例: "Conflict"） */
  readonly title: string
  readonly status: number
  /** この発生に固有の説明（任意） */
  readonly detail?: string
  /** この発生を識別する URI（任意） */
  readonly instance?: string
  /** エラーコード（拡張メンバー）。クライアントはこれで分岐する */
  readonly code: Code
  /** INVALID_INPUT のときの不正な入力の一覧（拡張メンバー、任意） */
  readonly invalidParams?: readonly InvalidParam[]
}
