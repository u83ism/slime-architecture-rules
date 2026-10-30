# @u83ism/architecture-rules

**Slime Architecture** の共通定義パッケージ。
アーキテクチャレベル・レイヤー名・フォルダパターン・Kaachanの検査項目と重大度・AI向けrulesテンプレートを、TypeScript の型・定数とファイルとして提供します。

Kaachan（静的解析ツール）と Slime FW（Webフレームワーク）の双方が、このパッケージを唯一の参照元（Single Source of Truth）として利用することで、ルール定義の二重管理を防ぎます。

## インストール

```bash
npm install @u83ism/architecture-rules
```

## 提供するもの

### `ArchitectureLevel`

Slime Architecture の段階を表す型。

```ts
import type { ArchitectureLevel } from "@u83ism/architecture-rules"
// 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
```

### `LEVEL_DEFINITIONS` / `getLevelDefinition`

Lv1〜Lv10 の定義（名前・説明・証拠ラベル・次のレベルへの要件）。

```ts
import { LEVEL_DEFINITIONS, getLevelDefinition } from "@u83ism/architecture-rules"

const lv5 = getLevelDefinition(5)
console.log(lv5.name)        // "Logic Layer"
console.log(lv5.description) // "ドメインロジックを logic.ts または logic/ フォルダに切り出した構成。"
```

### `RULE_CATALOG` / `getRuleSeverity` / `getRulesForLevel`

Kaachan が検査するルールの一覧と、レベルごとの重大度。**重大度の唯一の正**です。
Kaachan は違反の検出だけを担い、重大度はここから引きます。設計文書の検査項目一覧と、AI向けrulesテンプレートの "What Kaachan Checks" もここから自動生成しています。

```ts
import { getRuleDefinition, getRuleSeverity, getRulesForLevel } from "@u83ism/architecture-rules"

const rule = getRuleDefinition("store-naming")!
getRuleSeverity(rule, 4) // "hint"
getRuleSeverity(rule, 6) // "error"

getRulesForLevel(7)      // Lv7 で有効な全ルールと重大度
```

### `LAYER_FILES`

各レイヤーのファイル名定数。

```ts
import { LAYER_FILES } from "@u83ism/architecture-rules"

LAYER_FILES.ROUTE       // "route.ts"
LAYER_FILES.WORKFLOW    // "workflow.ts"
LAYER_FILES.MIDDLEWARE  // "middleware.ts"
LAYER_FILES.PARSE       // "parse.ts"
LAYER_FILES.STORE       // "store.ts"
LAYER_FILES.CLIENT      // "client.ts"
LAYER_FILES.LOGIC       // "logic.ts"
LAYER_FILES.PORTS       // "ports.ts"
LAYER_FILES.ERRORS      // "errors.ts"
```

### `ProblemDetails` / `BUILT_IN_ERROR_CODES`

エラー応答の形式（Problem Details, RFC 9457）と、FW が自動で返すエラーコード。業務上の拒否は、アプリが宣言したエラーコードを拡張メンバー `code` に入れて 4xx で返します。フロントエンドはこの型を `import type` して、エラーコードごとの文言の対応表を網羅させられます。

```ts
import type { ProblemDetails } from "@u83ism/architecture-rules"
import type { DomainErrorCode } from "your-api/errors"

const MESSAGES: Record<DomainErrorCode, string> = { USER_ALREADY_EXISTS: "このメールアドレスは登録済みです" }
const body: ProblemDetails<DomainErrorCode> = await res.json()
```

### `FOLDER_NAMES`

フォルダ名定数。

```ts
import { FOLDER_NAMES } from "@u83ism/architecture-rules"

FOLDER_NAMES.LOGIC           // "logic"
FOLDER_NAMES.APP             // "app"
FOLDER_NAMES.SHARED          // "shared"
FOLDER_NAMES.CLIENT          // "client"
FOLDER_NAMES.INFRASTRUCTURE  // "infrastructure"
FOLDER_NAMES.COMMAND         // "command"
FOLDER_NAMES.QUERY           // "query"
FOLDER_NAMES.DOMAINS         // "domains"      直下の各フォルダが1つのドメイン（例: domains/user）
FOLDER_NAMES.ORCHESTRATE     // "orchestrate"  直下の各フォルダが1つの調整役（例: orchestrate/order-inventory）
```

### `FOLDER_PATTERNS`

フォルダ名のパターン定数。

```ts
import { FOLDER_PATTERNS } from "@u83ism/architecture-rules"

FOLDER_PATTERNS.KEBAB_CASE.test("order-item") // true  domains/・orchestrate/ 直下のフォルダ名は kebab-case
FOLDER_PATTERNS.KEBAB_CASE.test("orderItem")  // false
```

### `DomainDependencies`

ドメイン間の依存宣言（Lv6以降）の型。宣言にない向きの import と、宣言そのものの循環は Kaachan が Error として検出します。

```ts
import type { DomainDependencies } from "@u83ism/architecture-rules"

const domains: DomainDependencies = {
  auth: [],                            // 最上流：どのドメインにも依存しない
  user: ["auth"],
  order: ["auth", "user"],
}
```

### AI向け rules テンプレート（`RULES_TARGETS` / `rulesTemplateSpecifier` / `renderRulesForTarget`）

Lv1〜Lv10 のテンプレート本体を同梱しています。`@u83ism/architecture-rules/rules/lv5.md` のように参照できます。
`RULES_TARGETS` は AIツールごとの配置先と差分（Cursor の frontmatter 等）の定義です。

```ts
import { readFile } from "node:fs/promises"
import { RULES_TARGETS, rulesTemplateSpecifier, renderRulesForTarget } from "@u83ism/architecture-rules"

const template = await readFile(new URL(import.meta.resolve(rulesTemplateSpecifier(5))), "utf-8")
const cursor = RULES_TARGETS.find((t) => t.id === "cursor")!
const output = renderRulesForTarget(template, cursor) // → .cursor/rules/slime.mdc に書き出す
```

### `Severity`

診断メッセージの深刻度を表す型。

```ts
import type { Severity } from "@u83ism/architecture-rules"
// "hint" | "warning" | "error"
```

---

## このパッケージが存在する理由

Slime Architecture を実装するプロジェクトは複数あります。

| プロジェクト | 役割 |
|---|---|
| [Kaachan](https://github.com/u83ism/kaachan) | 静的解析ツール（Linter）。アーキテクチャレベルを検出し、ルール違反を指摘する |
| Slime FW（構想中） | Webアプリケーションフレームワーク。スキャフォールド・マイグレーション機能を提供する |

これらは別リポジトリ・別モジュールですが、「Lv5はlogic層が必要」「store の命名規則違反は Lv6 から Error」といった**アーキテクチャのルール定義は共通**です。

各プロジェクトが独自にルールを定義すると、定義が食い違ったり更新が片方に反映されないといった問題が起きます。このパッケージに定義を集約することで、双方が常に同じ認識を持つことができます。

---

## 設計ドキュメント

文書間で記述が食い違った場合は **Lv別アーキテクチャリファレンスが正本**です。Kaachan の検査項目と重大度だけは `src/rules-catalog.ts` が正で、文書の一覧はそこから自動生成しています。

| ファイル | 内容 |
|---|---|
| [Lv別アーキテクチャリファレンス.md](./docs/ja/Lv別アーキテクチャリファレンス.md) | **正本**。各Lvの完成形スナップショット（構造・レイヤールール・Kaachanの検査項目） |
| [🤤 僕の考えた最強の次世代Webアプリケーションアーキテクチャ（進化論）.md](./docs/ja/🤤%20僕の考えた最強の次世代Webアプリケーションアーキテクチャ（進化論）.md) | Slime Architecture のメイン資料。Lv1〜Lv10 の設計を物語として説明する |
| [🤤 僕の考えた最強の次世代Webアプリケーションフレームワーク（案）.md](./docs/ja/🤤%20僕の考えた最強の次世代Webアプリケーションフレームワーク（案）.md) | Kaachan・Slime FW の機能概要と設計方針 |
| [Kaachan&Slime&Slime Architecture構想の設計根拠、補足資料.md](./docs/ja/Kaachan%26Slime%26Slime%20Architecture構想の設計根拠、補足資料.md) | 各LvのADR（設計理由の記録）・想定問答・補足資料 |
| [Kaachan設計仕様.md](./docs/ja/Kaachan設計仕様.md) | Kaachan の実装詳細（Fat Logic検出戦略・Fat Parse問題など） |
| [Slime FW詳細設計.md](./docs/ja/Slime%20FW詳細設計.md) | Slime FW の実装詳細（メトリクス自動計装・OTel連携など） |
| [AI-rulesテンプレート 設計方針.md](./docs/ja/AI-rulesテンプレート%20設計方針.md) | AI向け rules テンプレートの仕組みと使い方 |
| [非同期・キュー導入 設計方針.md](./docs/ja/非同期・キュー導入%20設計方針.md) | Lvとは別軸の「負荷・信頼性」の扱い。キュー導入（Outbox・冪等性・リトライ）とパフォーマンス対策、能力（capability）軸の検査案 |

## 開発用コマンド

```bash
npm run typecheck      # 型チェック
npm run build          # dist/ を生成
npm run build:rules    # rules-catalog から検査項目一覧を生成し、ツール別 rules ファイルを rules/<tool>/ に出力
npm run build:qiita    # Qiita 投稿用の Markdown を qiita/ に出力（相対リンクを Qiita の URL に置換）
```

Qiita でも公開しています。

- [🤤 僕の考えた最強の次世代Webアプリケーションフレームワーク（案）](https://qiita.com/u83unlimited/items/8b0e5b51749ccdfde393)
- [🤤 僕の考えた最強の次世代Webアプリケーションアーキテクチャ（進化論）](https://qiita.com/u83unlimited/items/86c9b0f5571e3e802ace)
- [👩 Kaachan &💧Slime &🏗️Slime Architecture構想の設計根拠、補足資料](https://qiita.com/u83unlimited/items/69a554c216d7b4bbc1b2)
