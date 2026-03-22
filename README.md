# @u83ism/architecture-rules

**Slime Architecture** の共通定義パッケージ。
アーキテクチャレベル・レイヤー名・フォルダパターン・Severity型を TypeScript の型・定数として提供します。

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

### `LAYER_FILES`

各レイヤーのファイル名定数。

```ts
import { LAYER_FILES } from "@u83ism/architecture-rules"

LAYER_FILES.ROUTE       // "route.ts"
LAYER_FILES.WORKFLOW    // "workflow.ts"
LAYER_FILES.MIDDLEWARE  // "middleware.ts"
LAYER_FILES.PARSE       // "parse.ts"
LAYER_FILES.REPOSITORY  // "repository.ts"
LAYER_FILES.CLIENT      // "client.ts"
LAYER_FILES.LOGIC       // "logic.ts"
LAYER_FILES.PORTS       // "ports.ts"
```

### `FOLDER_NAMES`

フォルダ名定数。

```ts
import { FOLDER_NAMES } from "@u83ism/architecture-rules"

FOLDER_NAMES.LOGIC           // "logic"
FOLDER_NAMES.APP             // "app"
FOLDER_NAMES.SHARED          // "shared"
FOLDER_NAMES.INFRASTRUCTURE  // "infrastructure"
FOLDER_NAMES.COMMAND         // "command"
FOLDER_NAMES.QUERY           // "query"
```

### `FOLDER_PATTERNS`

特殊なフォルダのパターン定数。

```ts
import { FOLDER_PATTERNS } from "@u83ism/architecture-rules"

FOLDER_PATTERNS.DOMAIN       // /^domain[A-Z]/  （例: domainUser, domainOrder）
FOLDER_PATTERNS.CROSS_PREFIX // "cross-"         （例: cross-auth, cross-mail）
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

これらは別リポジトリ・別モジュールですが、「Lv5はlogic層が必要」「domainフォルダは `domain[A-Z]` 形式」といった**アーキテクチャのルール定義は共通**です。

各プロジェクトが独自にルールを定義すると、定義が食い違ったり更新が片方に反映されないといった問題が起きます。このパッケージに定義を集約することで、双方が常に同じ認識を持つことができます。

---

## 設計ドキュメント

Slime Architecture の詳細設計は以下のドキュメントを参照してください。

| ファイル | 内容 |
|---|---|
| [🤤 僕の考えた最強の次世代Webアプリケーションアーキテクチャ（進化論）.md](./🤤%20僕の考えた最強の次世代Webアプリケーションアーキテクチャ（進化論）.md) | Slime Architectureのメイン資料。Lv1〜Lv10の全体設計と各Lvの詳細 |
| [🤤 僕の考えた最強の次世代Webアプリケーションフレームワーク（案）.md](./🤤%20僕の考えた最強の次世代Webアプリケーションフレームワーク（案）.md) | Kaachan・Slime FWの機能概要と設計方針 |
| [Kaachan設計仕様.md](./Kaachan設計仕様.md) | Kaachanの実装詳細（Fat Logic検出戦略・Fat Parse問題など） |
| [Slime FW詳細設計.md](./Slime%20FW詳細設計.md) | Slime FWの実装詳細（メトリクス自動計装・OTel連携など） |
| [Kaachan&Slime&Slime Architecture構想の設計根拠、補足資料.md](./Kaachan&Slime&Slime%20Architecture構想の設計根拠、補足資料.md) | 各LvのADR（設計理由の記録）・想定問答・補足資料 |

Qiitaでも公開しています。

- [🤤 僕の考えた最強の次世代Webアプリケーションフレームワーク（案）](https://qiita.com/u83unlimited/items/8b0e5b51749ccdfde393)
- [🤤 僕の考えた最強の次世代Webアプリケーションアーキテクチャ（進化論）](https://qiita.com/u83unlimited/items/86c9b0f5571e3e802ace)
- [👩 Kaachan &💧Slime &🏗️Slime Architecture構想の設計根拠、補足資料](https://qiita.com/u83unlimited/items/69a554c216d7b4bbc1b2)
