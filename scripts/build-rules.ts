/**
 * Builds AI rules files for all supported tools from _content/ source templates.
 *
 * 1. Regenerates the "What Kaachan Checks" sections (and the docs' check lists)
 *    from src/rules-catalog.ts — see scripts/generate-checks.ts
 * 2. Writes one file per tool and level, using the targets in src/rules-targets.ts
 *
 * Usage:
 *   npx tsx scripts/build-rules.ts
 *
 * Output (gitignored):
 *   rules/claude/lv1.md  ... lv10.md   → copy as CLAUDE.md
 *   rules/codex/lv1.md   ... lv10.md   → copy as AGENTS.md
 *   rules/gemini/lv1.md  ... lv10.md   → copy as .gemini/styleguide.md
 *   rules/cursor/lv1.mdc ... lv10.mdc  → copy as .cursor/rules/slime.mdc
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { RULES_TARGETS, renderRulesForTarget } from "../src/rules-targets.js"
import { generateChecks } from "./generate-checks.js"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const CONTENT_DIR = join(ROOT, "rules", "_content")
const OUTPUT_DIR = join(ROOT, "rules")

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

function buildRules(): void {
  generateChecks()

  let totalWritten = 0
  for (const target of RULES_TARGETS) {
    const targetDir = join(OUTPUT_DIR, target.id)
    mkdirSync(targetDir, { recursive: true })

    for (const level of LEVELS) {
      const template = readFileSync(join(CONTENT_DIR, `lv${level}.md`), "utf-8").replace(/\r\n/g, "\n")
      writeFileSync(join(targetDir, `lv${level}.${target.ext}`), renderRulesForTarget(template, target), "utf-8")
      totalWritten++
    }

    console.log(`✓ ${target.id}/  (lv1–lv10.${target.ext})  →  copy as ${target.destPath}`)
  }

  console.log(`\nDone. ${totalWritten} files written to rules/`)
}

buildRules()
