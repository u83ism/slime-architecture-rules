> **位置づけ：** Slime ArchitectureのアーキテクチャレベルごとにAI向けrulesファイルのテンプレートを提供する仕組みの設計方針と使い方。

---

## 概要

Slime Architectureを採用するプロジェクトで、Claude Code・Cursor・Codex・Gemini等のAIアシスタントが正しいアーキテクチャを理解した状態で動作するよう、**レベルごとのrulesファイルテンプレート**を提供する。

---

## ディレクトリ構成

```
rules/
  _content/          ← 正本（ここだけ編集する）
    lv1.md
    lv2.md
    ...
    lv10.md
  claude/            ← 生成物: CLAUDE.md としてコピー
    lv1.md
    ...
    lv10.md
  codex/             ← 生成物: AGENTS.md としてコピー
    lv1.md
    ...
    lv10.md
  gemini/            ← 生成物: .gemini/styleguide.md としてコピー
    lv1.md
    ...
    lv10.md
  cursor/            ← 生成物: .cursor/rules/slime.mdc としてコピー
    lv1.mdc
    ...
    lv10.mdc

src/
  rules-catalog.ts   ← Kaachanの検査項目と重大度（唯一の正）
  rules-targets.ts   ← AIツールごとの配置先とfrontmatter

scripts/
  generate-checks.ts ← rules-catalog.ts → テンプレートと文書の検査項目一覧を生成
  build-rules.ts     ← generate-checks を実行してから、_content/ → 各ツール向けファイルを生成
```

---

## 設計判断

### なぜテンプレートのコピーか（自動生成でないか）

rulesファイルの内容の大部分は「AIに守らせたいルールの散文」であり、`LEVEL_DEFINITIONS` 等のデータから機械的に生成できるものではない。内容は人間が書く必要があるため、静的テンプレートが適切。

例外は「What Kaachan Checks at LvN」の節で、ここだけは `src/rules-catalog.ts` から自動生成する。重大度は Kaachan の実装・リファレンス・FW文書と食い違いやすく、データとして1か所に置かないと同期が保てないため。生成範囲は `<!-- BEGIN GENERATED ... -->` と `<!-- END GENERATED -->` の目印で囲まれており、この中は手で編集しない。

### なぜ_contentが正本か（ツール別フォルダが正本でないか）

Claude・Codex・GeminiはMarkdownをそのまま使い、Cursorだけfrontmatterが追加で必要。この差異のため、**共通内容を`_content/`に一本化**し、ツール別の差分（Cursorのfrontmatter等）をビルドスクリプトで付与するDRY構成にした。

新たなAIツールに対応する場合は `src/rules-targets.ts` の `RULES_TARGETS` 配列に1エントリ追加するだけでよい。この定義はパッケージから export されるので、Kaachanの `export:rules` も同じ定義を使える。

### なぜLv1〜10の全レベルか（マイルストーン単位でないか）

テンプレートは累積型（Lv5はLv1〜4のルールも全部含む）なので、上から積み上げて書くのが自然かつミスが少ない。プロジェクトがどのレベルにあっても対応できるよう全10レベルを提供する。

### 言語

`_content/` の正本は**英語**。コード・コミットメッセージと同様にAI支援で英語アウトプットとする。日本語の設計意図・根拠はこの `docs/ja/` に記述する。

---

## 使い方

### 自分のプロジェクトのレベルを確認する

```bash
slime level:current   # 現在のアーキテクチャレベルを表示
```

または `@u83ism/architecture-rules` の `getLevelDefinition()` を参照する。

### テンプレートをコピーする

プロジェクトが例えばLv5であれば:

```bash
# Claude Code
cp rules/claude/lv5.md /path/to/your-project/CLAUDE.md

# Codex
cp rules/codex/lv5.md /path/to/your-project/AGENTS.md

# Gemini Code Assist
mkdir -p /path/to/your-project/.gemini
cp rules/gemini/lv5.md /path/to/your-project/.gemini/styleguide.md

# Cursor
mkdir -p /path/to/your-project/.cursor/rules
cp rules/cursor/lv5.mdc /path/to/your-project/.cursor/rules/slime.mdc
```

### テンプレートを更新する（このリポジトリの作業）

```bash
# _content/ 以下のファイルを編集してから:
npm run build:rules
```

`_content/` を直接編集し、`npm run build:rules` で全ツール向けファイルを再生成する。ツール別フォルダ（`claude/`, `cursor/` 等）は**直接編集しない**。

Kaachanの検査項目や重大度を変えるときは、テンプレートではなく `src/rules-catalog.ts` を編集してから `npm run build:rules` を実行する。テンプレート・リファレンス・FW文書の検査項目一覧がまとめて更新される。

---

## パッケージとしての配布

テンプレートの正本（`rules/_content/`）は `@u83ism/architecture-rules` に同梱して配布する。利用側は `@u83ism/architecture-rules/rules/lv5.md` のように参照できる（`rulesTemplateSpecifier(level)` がこの指定子を返す）。

Kaachanの `export:rules` は、判定したLvのテンプレートを読み、`RULES_TARGETS` の定義に従ってツール別の差分（Cursorのfrontmatter等）を付けて出力するだけにする。AI向けの制約文をKaachan側に別途持たない（以前はKaachan内に直書きの写しがあり、テンプレートと食い違っていた）。

---

## 各ツールの配置先まとめ

| ツール | コピー先 | 備考 |
|---|---|---|
| Claude Code | `CLAUDE.md` | プロジェクトルートまたは任意のディレクトリ |
| Codex (OpenAI) | `AGENTS.md` | プロジェクトルート |
| Gemini Code Assist | `.gemini/styleguide.md` | プロジェクトルートの `.gemini/` フォルダ |
| Cursor | `.cursor/rules/slime.mdc` | frontmatter付き。`alwaysApply: true` で常時適用 |

---

## テンプレートの内容構成

各レベルのテンプレートは以下を含む：

1. **プロジェクト構成** — そのレベルで存在するファイル/フォルダの一覧
2. **各レイヤーのルール** — 何をすべきか・何をすべきでないかのコード例つき説明
3. **エラーハンドリング** — DomainError / TechnicalError の扱い
4. **Kaachanが静的検査する項目** — AIとKaachanの役割分担を明示（`src/rules-catalog.ts` から自動生成。そのLvで有効な全項目を重大度順に並べる）
5. **AIアシスタント向けガイダンス** — 特定の状況でAIがどう動くべきかの指針
6. **次のレベルへ進むために必要なもの** — Lv昇格のトリガー情報

---

## KaachanとrulesファイルのAI役割分担

| 役割 | 担当 |
|---|---|
| 構造違反・命名規則違反・肥大化の客観的検出 | Kaachan（静的解析） |
| 「なぜそのルールがあるか」の文脈理解 | rulesファイル経由のAI |
| ドメイン境界の提案・設計の相談 | rulesファイル経由のAI |
| 「どこで切るか」の最終判断 | ユーザー ＋ AI との対話 |

Kaachanが「何が起きているか（構造的事実）」を検出し、rulesファイルが「どうすべきか（設計の文脈）」をAIに伝える。静的解析で検知できない意味的な問題（業務ルールの染み出し、ドメイン境界の判断）をAIが補う設計。
