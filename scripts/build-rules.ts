/**
 * Builds AI rules files for all supported tools from _content/ source templates.
 *
 * Usage:
 *   npx tsx scripts/build-rules.ts
 *
 * Output:
 *   rules/claude/lv1.md  ... lv10.md   → copy as CLAUDE.md
 *   rules/codex/lv1.md   ... lv10.md   → copy as AGENTS.md
 *   rules/gemini/lv1.md  ... lv10.md   → copy as .gemini/styleguide.md
 *   rules/cursor/lv1.mdc ... lv10.mdc  → copy as .cursor/rules/slime.mdc
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const CONTENT_DIR = join(ROOT, "rules", "_content")
const OUTPUT_DIR = join(ROOT, "rules")

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

type Tool = {
  /** Output subdirectory name under rules/ */
  dir: string
  /** File extension for output files */
  ext: "md" | "mdc"
  /** Optional frontmatter to prepend (Cursor only) */
  frontmatter: string | null
  /** Human-readable destination path (for README/docs) */
  destExample: string
}

const TOOLS: Tool[] = [
  {
    dir: "claude",
    ext: "md",
    frontmatter: null,
    destExample: "CLAUDE.md",
  },
  {
    dir: "codex",
    ext: "md",
    frontmatter: null,
    destExample: "AGENTS.md",
  },
  {
    dir: "gemini",
    ext: "md",
    frontmatter: null,
    destExample: ".gemini/styleguide.md",
  },
  {
    dir: "cursor",
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
    destExample: ".cursor/rules/slime.mdc",
  },
]

function buildRules(): void {
  let totalWritten = 0

  for (const tool of TOOLS) {
    const toolDir = join(OUTPUT_DIR, tool.dir)
    mkdirSync(toolDir, { recursive: true })

    for (const level of LEVELS) {
      const contentPath = join(CONTENT_DIR, `lv${level}.md`)
      const content = readFileSync(contentPath, "utf-8")

      const output =
        tool.frontmatter !== null ? tool.frontmatter + content : content

      const outPath = join(toolDir, `lv${level}.${tool.ext}`)
      writeFileSync(outPath, output, "utf-8")
      totalWritten++
    }

    console.log(`✓ ${tool.dir}/  (lv1–lv10.${tool.ext})  →  copy as ${tool.destExample}`)
  }

  console.log(`\nDone. ${totalWritten} files written to rules/`)
}

buildRules()
