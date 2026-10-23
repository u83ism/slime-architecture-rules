/**
 * AI 向け rules テンプレートの配布先（AIコーディングツールごとの差分）。
 *
 * テンプレート本体は rules/_content/lv*.md にあり、このパッケージに同梱される。
 * パッケージ利用者は `@u83ism/architecture-rules/rules/lv5.md` のように参照できる。
 * - このリポジトリの scripts/build-rules.ts は、この定義に従ってツール別ファイルを生成する
 * - Kaachan の export:rules も、この定義とテンプレートを使って出力する
 */

import type { ArchitectureLevel } from "./levels.js"

export interface RulesTarget {
  /** 識別子（CLI の --target 引数などに使う） */
  readonly id: "claude" | "codex" | "gemini" | "cursor"
  /** 生成ファイルの拡張子 */
  readonly ext: "md" | "mdc"
  /** 先頭に付けるfrontmatter（不要なら null） */
  readonly frontmatter: string | null
  /** 利用者のプロジェクトでの配置先 */
  readonly destPath: string
}

export const RULES_TARGETS: readonly RulesTarget[] = [
  { id: "claude", ext: "md", frontmatter: null, destPath: "CLAUDE.md" },
  { id: "codex", ext: "md", frontmatter: null, destPath: "AGENTS.md" },
  { id: "gemini", ext: "md", frontmatter: null, destPath: ".gemini/styleguide.md" },
  {
    id: "cursor",
    ext: "mdc",
    frontmatter: [
      "---",
      "description: Slime Architecture rules for this project",
      "globs:",
      "  - '**/*.ts'",
      "alwaysApply: true",
      "---",
      "",
    ].join("\n"),
    destPath: ".cursor/rules/slime.mdc",
  },
]

/** パッケージ内でのテンプレートの参照パス（例: "@u83ism/architecture-rules/rules/lv5.md"） */
export const rulesTemplateSpecifier = (level: ArchitectureLevel): string =>
  `@u83ism/architecture-rules/rules/lv${level}.md`

/** テンプレート本文にツール別の差分を適用する */
export const renderRulesForTarget = (template: string, target: RulesTarget): string =>
  target.frontmatter !== null ? target.frontmatter + template : template
