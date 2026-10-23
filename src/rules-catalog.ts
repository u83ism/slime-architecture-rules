/**
 * Kaachan が検査するルールの一覧と、レベルごとの重大度。
 *
 * 重大度の唯一の正（Single Source of Truth）。
 * - Kaachan は違反の「検出」だけを担い、重大度はこの一覧から引く
 * - docs/ja/Lv別アーキテクチャリファレンス.md・FW文書の検査項目一覧と、
 *   rules/_content/lv*.md の "What Kaachan Checks" は `npm run build:rules` でここから生成される
 *
 * severity は「そのレベル以降の重大度」を表す段階の列。
 * 例: [[4, "hint"], [6, "error"]] は Lv4〜5 で hint、Lv6 以降で error。最初の段階より前のレベルでは検査しない。
 */

import type { ArchitectureLevel } from "./levels.js"
import type { Severity } from "./severity.js"

export type SeverityStep = readonly [ArchitectureLevel, Severity]

export interface RuleDefinition {
  /** 安定した識別子（kebab-case）。Kaachan の診断メッセージの ruleId と対応させる */
  readonly id: string
  /** 検査内容の要約。ja は docs/ja 向け、en は AI 向け rules テンプレート向け */
  readonly summary: { readonly ja: string; readonly en: string }
  /** レベルごとの重大度（昇順） */
  readonly severity: readonly SeverityStep[]
}

export const RULE_CATALOG: readonly RuleDefinition[] = [
  // ---- Lv2: route / middleware / workflow ----
  {
    id: "route-api-namespace",
    summary: {
      ja: "`/api` グループの外でAPIルートを定義している",
      en: "API routes are defined outside an `/api` group",
    },
    severity: [[2, "hint"]],
  },
  {
    id: "route-handler-non-http",
    summary: {
      ja: "route のハンドラーがHTTPの入出力以外（store・logic・DBの呼び出し等）を行っている",
      en: "A route handler does work other than HTTP I/O (store, logic, or DB calls)",
    },
    severity: [[2, "hint"], [3, "warning"]],
  },
  {
    id: "workflow-auth-import",
    summary: {
      ja: "`workflow.ts` が認証ライブラリを直接importしている（Middlewareの仕事）",
      en: "`workflow.ts` imports an auth library directly (that is middleware's job)",
    },
    severity: [[2, "warning"]],
  },
  {
    id: "workflow-size-hint",
    summary: {
      ja: "`workflow.ts` が300行 / 10関数を超えている",
      en: "`workflow.ts` exceeds ~300 lines or ~10 functions",
    },
    severity: [[2, "hint"]],
  },
  {
    id: "workflow-size-warning",
    summary: {
      ja: "`workflow.ts` が500行を超えている",
      en: "`workflow.ts` exceeds ~500 lines",
    },
    severity: [[2, "warning"]],
  },

  // ---- Lv3: parse ----
  {
    id: "parse-db-import",
    summary: {
      ja: "parse がDB/ORMモジュールをimportしている",
      en: "parse imports a DB/ORM module",
    },
    severity: [[3, "error"]],
  },
  {
    id: "workflow-http-access",
    summary: {
      ja: "workflow がHTTPのリクエスト・レスポンス・コンテキストに触れている",
      en: "A workflow touches HTTP request, response, or context objects",
    },
    severity: [[3, "warning"]],
  },
  {
    id: "workflow-calls-parse",
    summary: {
      ja: "workflow がparse関数を呼んでいる（parseはrouteで行う）",
      en: "A workflow calls a parse function (parsing belongs in route)",
    },
    severity: [[3, "hint"]],
  },
  {
    id: "workflow-raw-parse",
    summary: {
      ja: "workflow が `JSON.parse()` 等で入力を直接パースしている",
      en: "A workflow parses raw input directly (e.g., `JSON.parse()`)",
    },
    severity: [[3, "warning"]],
  },
  {
    id: "workflow-throws-plain-error",
    summary: {
      ja: "workflow が素の `Error` を投げている（業務上の拒否なら500になる。Lv3〜4は `DomainError`、Lv5以降は `err()` を使う）",
      en: "A workflow throws a plain `Error` (a business rejection would become HTTP 500; use `DomainError` at Lv3–4 and `err()` from Lv5)",
    },
    severity: [[3, "warning"]],
  },
  {
    id: "slime-config-missing",
    summary: {
      ja: "`slime.config.ts` がない（エラーコードとHTTPステータスの対応表を置く）",
      en: "`slime.config.ts` is missing (it maps error codes to HTTP status codes)",
    },
    severity: [[3, "hint"]],
  },
  {
    id: "parse-size-hint",
    summary: {
      ja: "`parse.ts` が300行 / 10関数を超えている（共通スキーマは許容）",
      en: "`parse.ts` exceeds ~300 lines or ~10 functions (shared schemas are allowed)",
    },
    severity: [[3, "hint"]],
  },
  {
    id: "parse-size-warning",
    summary: {
      ja: "`parse.ts` が500行を超えている（`parse/` への分割を促す）",
      en: "`parse.ts` exceeds ~500 lines (split into `parse/`)",
    },
    severity: [[3, "warning"]],
  },
  {
    id: "parse-folder-file-too-large",
    summary: {
      ja: "`parse/` 内のファイルが300行を超えている",
      en: "A file in `parse/` exceeds ~300 lines",
    },
    severity: [[3, "error"]],
  },

  // ---- Lv4: store / client ----
  {
    id: "workflow-orm-import",
    summary: {
      ja: "workflow がORM/DBモジュールを直接importしている",
      en: "A workflow imports an ORM/DB module directly",
    },
    severity: [[4, "error"]],
  },
  {
    id: "workflow-orm-transaction",
    summary: {
      ja: "workflow がORM固有のトランザクションAPIを直書きしている（`withTransaction()` を使う）",
      en: "A workflow calls an ORM-specific transaction API directly (use `withTransaction()`)",
    },
    severity: [[4, "warning"]],
  },
  {
    id: "store-naming",
    summary: {
      ja: "store の関数名が命名規則（`find*` / `list*` / `get*` / `count*` / `search*` / `create*` / `save*` / `update*` / `delete*` / `remove*`）に違反している",
      en: "A store function name violates the naming convention (`find*` / `list*` / `get*` / `count*` / `search*` / `create*` / `save*` / `update*` / `delete*` / `remove*`)",
    },
    severity: [[4, "hint"], [6, "error"]],
  },
  {
    id: "store-orm-return-type",
    summary: {
      ja: "store がORM型を戻り値に使っている",
      en: "A store function returns an ORM type",
    },
    severity: [[4, "warning"], [6, "error"]],
  },

  // ---- Lv5: logic ----
  {
    id: "logic-store-client-import",
    summary: {
      ja: "logic が store / client / DB・ORMモジュールをimportしている",
      en: "logic imports store, client, or a DB/ORM module",
    },
    severity: [[5, "error"]],
  },
  {
    id: "logic-throws",
    summary: {
      ja: "logic が throw している（Result型で返す）",
      en: "logic throws (return a `Result` instead)",
    },
    severity: [[5, "error"]],
  },
  {
    id: "logic-missing-prefix",
    summary: {
      ja: "logic関数にドメインprefixがない（`userCan*` 等）",
      en: "A logic function has no domain prefix (`userCan*`, etc.)",
    },
    severity: [[5, "warning"]],
  },
  {
    id: "logic-test-missing",
    summary: {
      ja: "logic に対応するテストファイル（`logic.test.ts`）がない",
      en: "logic has no corresponding test file (`logic.test.ts`)",
    },
    severity: [[5, "warning"], [7, "error"]],
  },
  {
    id: "logic-size-hint",
    summary: {
      ja: "`logic.ts` が300行 / 10関数を超えている（`logic/` への分割を促す）",
      en: "`logic.ts` exceeds ~300 lines or ~10 functions (consider splitting into `logic/`)",
    },
    severity: [[5, "hint"]],
  },
  {
    id: "logic-size-warning",
    summary: {
      ja: "`logic.ts` が500行を超えている、prefixが混在している、または型依存が交差しない関数群がある",
      en: "`logic.ts` exceeds ~500 lines, mixes domain prefixes, or contains function groups whose type dependencies do not intersect",
    },
    severity: [[5, "warning"]],
  },
  {
    id: "logic-folder-file-too-large",
    summary: {
      ja: "`logic/` 内のファイルが300行を超えている、またはprefixの混在が解消されていない",
      en: "A file in `logic/` exceeds ~300 lines or still mixes domain prefixes",
    },
    severity: [[5, "error"]],
  },
  {
    id: "workflow-throws-domain-error",
    summary: {
      ja: "workflow が `DomainError` を投げている（Lv5以降は `err()` でrouteまで返す）",
      en: "A workflow throws a `DomainError` (from Lv5, return `err()` up to the route instead)",
    },
    severity: [[5, "hint"], [6, "warning"]],
  },

  // ---- Lv6: domain folders ----
  {
    id: "domain-undeclared-import",
    summary: {
      ja: "依存宣言にないdomain間のimport",
      en: "An inter-domain import that is not in the dependency declaration",
    },
    severity: [[6, "error"]],
  },
  {
    id: "domain-dependency-cycle",
    summary: {
      ja: "domain間の依存宣言に循環がある",
      en: "The domain dependency declaration contains a cycle",
    },
    severity: [[6, "error"]],
  },
  {
    id: "client-direct-import",
    summary: {
      ja: "`client/client.ts` を直接importしている（`client/adapter.ts` を経由していない）",
      en: "`client/client.ts` is imported directly (bypassing `client/adapter.ts`)",
    },
    severity: [[6, "error"]],
  },
  {
    id: "error-code-missing-prefix",
    summary: {
      ja: "domainのエラーコードにdomain名の接頭辞がない（`domainUser` なら `USER_*`）",
      en: "A domain error code lacks the domain prefix (`domainUser` → `USER_*`)",
    },
    severity: [[6, "warning"]],
  },
  {
    id: "shared-imports-domain",
    summary: {
      ja: "`shared/` がdomainフォルダをimportしている",
      en: "`shared/` imports from a domain folder",
    },
    severity: [[6, "warning"]],
  },
  {
    id: "shared-side-effects",
    summary: {
      ja: "`shared/utility.ts` / `shared/smallLogic.ts` に副作用がある",
      en: "`shared/utility.ts` or `shared/smallLogic.ts` has side effects",
    },
    severity: [[6, "error"]],
  },
  {
    id: "shared-size",
    summary: {
      ja: "`shared/` のファイルが肥大化している",
      en: "A file in `shared/` is too large",
    },
    severity: [[6, "warning"], [7, "error"]],
  },
  {
    id: "app-size",
    summary: {
      ja: "App層が肥大化している",
      en: "The App layer is too large",
    },
    severity: [[6, "warning"], [7, "error"]],
  },
  {
    id: "app-owns-store",
    summary: {
      ja: "`app/store.ts` が存在する（App層はDBアクセスを持たない）",
      en: "`app/store.ts` exists (the App layer must not own DB access)",
    },
    severity: [[6, "warning"], [7, "error"]],
  },
  {
    id: "app-owns-client",
    summary: {
      ja: "`app/client.ts` が存在する（`client/` へ移動する）",
      en: "`app/client.ts` exists (move it to `client/`)",
    },
    severity: [[6, "error"]],
  },
  {
    id: "app-owns-logic",
    summary: {
      ja: "App層がlogicを持っている（`app/logic.ts` またはビジネス判断の混在）",
      en: "The App layer contains logic (`app/logic.ts` or business judgment)",
    },
    severity: [[6, "warning"], [7, "error"]],
  },
  {
    id: "app-route-defines-routes",
    summary: {
      ja: "`app/route.ts` にルート定義がある（`domainXxx/routes.ts` へ移動する）",
      en: "`app/route.ts` defines routes (move them to `domainXxx/routes.ts`)",
    },
    severity: [[6, "warning"]],
  },
  {
    id: "app-route-size",
    summary: {
      ja: "`app/route.ts` が肥大化している",
      en: "`app/route.ts` is too large",
    },
    severity: [[6, "warning"]],
  },
  {
    id: "route-dead-target",
    summary: {
      ja: "ルート定義が存在しないWorkflowファイルを参照している（死んだルート候補）",
      en: "A route references a workflow file that does not exist (dead route candidate)",
    },
    severity: [[6, "warning"]],
  },
  {
    id: "workflow-unreachable",
    summary: {
      ja: "どのルートからも参照されていないWorkflowがある（到達不能Workflow候補）",
      en: "A workflow is not referenced by any route (unreachable workflow candidate)",
    },
    severity: [[6, "hint"]],
  },
  {
    id: "domain-missing-routes",
    summary: {
      ja: "domainフォルダに `routes.ts` がない",
      en: "A domain folder has no `routes.ts`",
    },
    severity: [[6, "hint"]],
  },
  {
    id: "route-sunset-passed",
    summary: {
      ja: "`sunset` 日付を過ぎたルートが残っている",
      en: "A route past its `sunset` date still exists",
    },
    severity: [[6, "warning"]],
  },

  // ---- Lv7: orchestrate- ----
  {
    id: "domain-imports-orchestrate",
    summary: {
      ja: "domainが `orchestrate-` フォルダをimportしている",
      en: "A domain imports from an `orchestrate-` folder",
    },
    severity: [[7, "error"]],
  },
  {
    id: "orchestrate-imports-orchestrate",
    summary: {
      ja: "`orchestrate-` フォルダ同士がimportし合っている",
      en: "An `orchestrate-` folder imports from another `orchestrate-` folder",
    },
    severity: [[7, "error"]],
  },
  {
    id: "orchestrate-imports-app",
    summary: {
      ja: "`orchestrate-` フォルダが `app/` をimportしている",
      en: "An `orchestrate-` folder imports from `app/`",
    },
    severity: [[7, "error"]],
  },
  {
    id: "defer-suggestion",
    summary: {
      ja: "`withTransaction()` 内に非DBの非同期処理（メール送信・外部API呼び出し等）がある（`defer()` を提案。opt-in）",
      en: "Non-DB async work (email, external API calls) inside `withTransaction()` (suggests `defer()`; opt-in)",
    },
    severity: [[7, "hint"]],
  },

  // ---- Lv8: domain events ----
  {
    id: "events-file-missing",
    summary: {
      ja: "`shared/events.ts` が存在しない",
      en: "`shared/events.ts` does not exist",
    },
    severity: [[8, "warning"]],
  },
  {
    id: "events-imports-domain",
    summary: {
      ja: "`shared/events.ts` がdomainや `orchestrate-` をimportしている",
      en: "`shared/events.ts` imports from a domain or `orchestrate-` folder",
    },
    severity: [[8, "error"]],
  },
  {
    id: "event-class-type",
    summary: {
      ja: "イベント型がクラスを含んでいる（純粋なデータ型のみ）",
      en: "An event type references a class (events must be plain data)",
    },
    severity: [[8, "error"]],
  },
  {
    id: "event-missing-type-field",
    summary: {
      ja: "イベント型に `type` フィールド（discriminated union）がない",
      en: "An event type has no `type` discriminant field",
    },
    severity: [[8, "warning"]],
  },
  {
    id: "event-type-not-upper-snake",
    summary: {
      ja: "イベント型の `type` が大文字スネークケースでない",
      en: "An event's `type` value is not UPPER_SNAKE_CASE",
    },
    severity: [[8, "warning"]],
  },
  {
    id: "orchestrate-without-transaction",
    summary: {
      ja: "`orchestrate-` フォルダに `withTransaction()` がない（ドメインイベントで代替できるはず）",
      en: "An `orchestrate-` folder has no `withTransaction()` (domain events + `defer()` may suffice)",
    },
    severity: [[8, "warning"]],
  },
  {
    id: "orchestrate-non-transactional-io",
    summary: {
      ja: "`orchestrate-` フォルダがメール送信・外部API呼び出し等の非トランザクション処理を含んでいる",
      en: "An `orchestrate-` folder contains non-transactional work (email, external API calls)",
    },
    severity: [[8, "warning"]],
  },

  // ---- Lv9: Ports & Adapters ----
  {
    id: "infrastructure-missing",
    summary: {
      ja: "`infrastructure/` フォルダが存在しない",
      en: "The `infrastructure/` folder does not exist",
    },
    severity: [[9, "warning"]],
  },
  {
    id: "domain-imports-infrastructure",
    summary: {
      ja: "domainフォルダが `infrastructure/` を直接importしている",
      en: "A domain folder imports from `infrastructure/` directly",
    },
    severity: [[9, "error"]],
  },
  {
    id: "orm-outside-infrastructure",
    summary: {
      ja: "ORM/DBモジュールのimportが `infrastructure/` 以外にある",
      en: "An ORM/DB module is imported outside `infrastructure/`",
    },
    severity: [[9, "error"]],
  },
  {
    id: "ports-has-implementation",
    summary: {
      ja: "`ports.ts` に実装コードがある（型定義のみ）",
      en: "`ports.ts` contains implementation code (type definitions only)",
    },
    severity: [[9, "error"]],
  },
  {
    id: "store-remains",
    summary: {
      ja: "`store.ts` がまだ残っている（`ports.ts` と `infrastructure/` に分離する）",
      en: "`store.ts` still exists (split it into `ports.ts` and `infrastructure/`)",
    },
    severity: [[9, "error"]],
  },
  {
    id: "workflow-not-port-injected",
    summary: {
      ja: "`ports.ts` があるのに、workflowがPortを引数で受け取っていない",
      en: "A domain has `ports.ts` but its workflow does not receive a port as an argument",
    },
    severity: [[9, "hint"]],
  },

  // ---- Lv10: CQRS ----
  {
    id: "cqrs-folders-missing",
    summary: {
      ja: "domainフォルダに `command/` と `query/` がない",
      en: "A domain folder has no `command/` and `query/` subfolders",
    },
    severity: [[10, "warning"]],
  },
  {
    id: "command-imports-query",
    summary: {
      ja: "`command/` が `query/` をimportしている（ReadPortを含む）",
      en: "`command/` imports from `query/` (including the ReadPort)",
    },
    severity: [[10, "error"]],
  },
  {
    id: "query-imports-write-port",
    summary: {
      ja: "`query/` がWritePortや書き込み用アダプターをimportしている",
      en: "`query/` imports a WritePort or a write adapter",
    },
    severity: [[10, "error"]],
  },
  {
    id: "query-writes",
    summary: {
      ja: "`query/` が書き込み操作を行っている",
      en: "`query/` performs a write operation",
    },
    severity: [[10, "error"]],
  },
  {
    id: "command-returns-view-model",
    summary: {
      ja: "`command/` のworkflowが読み取り最適化ビューモデルを返している",
      en: "A `command/` workflow returns a read-optimized view model",
    },
    severity: [[10, "warning"]],
  },
  {
    id: "query-multiple-per-file",
    summary: {
      ja: "`query/` の1ファイルに複数のクエリがある（1ファイル1クエリ）",
      en: "A `query/` file contains multiple queries (one query per file)",
    },
    severity: [[10, "warning"]],
  },
  {
    id: "query-shared-helper",
    summary: {
      ja: "`query/` 内で共通化されたヘルパーが複数のクエリファイルから使われている",
      en: "A shared helper inside `query/` is imported by multiple query files",
    },
    severity: [[10, "warning"]],
  },
  {
    id: "query-imports-domain-logic",
    summary: {
      ja: "`query/` がドメインのlogicをimportしている（ReadPortと読み取りモデルだけを使う）",
      en: "`query/` imports domain logic (use the ReadPort and read models only)",
    },
    severity: [[10, "warning"]],
  },
  {
    id: "query-file-size",
    summary: {
      ja: "`query/` のファイルが肥大化している",
      en: "A `query/` file is growing large",
    },
    severity: [[10, "hint"]],
  },
]

/** 指定レベルでのルールの重大度。そのレベルでは検査しない場合は undefined */
export const getRuleSeverity = (rule: RuleDefinition, level: ArchitectureLevel): Severity | undefined => {
  let current: Severity | undefined
  for (const [from, severity] of rule.severity) {
    if (from <= level) current = severity
  }
  return current
}

/** 指定レベルで有効なルールとその重大度の一覧 */
export const getRulesForLevel = (
  level: ArchitectureLevel,
): readonly { readonly rule: RuleDefinition; readonly severity: Severity }[] =>
  RULE_CATALOG.flatMap((rule) => {
    const severity = getRuleSeverity(rule, level)
    return severity === undefined ? [] : [{ rule, severity }]
  })

/** ID からルールを引く */
export const getRuleDefinition = (id: string): RuleDefinition | undefined =>
  RULE_CATALOG.find((rule) => rule.id === id)
