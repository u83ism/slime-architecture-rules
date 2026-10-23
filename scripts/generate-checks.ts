/**
 * src/rules-catalog.ts（重大度の唯一の正）から、文書とテンプレートの検査項目一覧を生成する。
 *
 * 次の目印で囲まれた範囲だけを書き換える（目印の外は触らない）:
 *   <!-- BEGIN GENERATED: kaachan-checks lv=N ... -->  …  <!-- END GENERATED -->
 *   <!-- BEGIN GENERATED: kaachan-matrix ... -->       …  <!-- END GENERATED -->
 *
 * 対象:
 * - docs/ja/Lv別アーキテクチャリファレンス.md … 各Lvで追加・変更された検査（日本語）と、全項目の重大度一覧表
 * - docs/ja/🤤 …フレームワーク（案）.md         … 各Lvで追加・変更された検査（日本語）
 * - rules/_content/lv*.md                      … そのLvで有効な全検査（英語・累積）
 *
 * Usage: npx tsx scripts/generate-checks.ts
 */

import { readFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { RULE_CATALOG, getRuleSeverity, getRulesForLevel } from "../src/rules-catalog.js"
import type { RuleDefinition } from "../src/rules-catalog.js"
import type { ArchitectureLevel } from "../src/levels.js"
import type { Severity } from "../src/severity.js"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const LEVELS: readonly ArchitectureLevel[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const LABEL: Record<Severity, string> = { hint: "💡 Hint", warning: "⚠️ Warning", error: "❌ Error" }
const ICON: Record<Severity, string> = { hint: "💡", warning: "⚠️", error: "❌" }
const ORDER: Record<Severity, number> = { error: 0, warning: 1, hint: 2 }

const BEGIN = /<!-- BEGIN GENERATED: ([a-z-]+)(?: lv=(\d+))?[^>]*-->/g
const END = "<!-- END GENERATED -->"

/** 目印の中身を render の結果で置き換える。改行コードは元のファイルに合わせる */
const fillMarkers = (
  path: string,
  render: (kind: string, level: ArchitectureLevel | undefined) => string,
): number => {
  const raw = readFileSync(path, "utf8")
  const crlf = raw.includes("\r\n")
  const text = raw.replace(/\r\n/g, "\n")
  let out = ""
  let cursor = 0
  let count = 0
  for (const m of text.matchAll(BEGIN)) {
    const beginEnd = (m.index ?? 0) + m[0].length
    const endAt = text.indexOf(END, beginEnd)
    if (endAt < 0) throw new Error(`${path}: END GENERATED が見つからない`)
    const kind = m[1] ?? ""
    const level = m[2] !== undefined ? (Number(m[2]) as ArchitectureLevel) : undefined
    out += text.slice(cursor, beginEnd) + "\n" + render(kind, level) + "\n"
    cursor = endAt
    count++
  }
  out += text.slice(cursor)
  writeFileSync(path, crlf ? out.replace(/\n/g, "\r\n") : out, "utf8")
  return count
}

const previousLevel = (level: ArchitectureLevel): ArchitectureLevel | undefined =>
  level > 1 ? ((level - 1) as ArchitectureLevel) : undefined

/** そのLvで新しく有効になった、または重大度が変わった検査（日本語） */
const renderLevelDiffJa = (level: ArchitectureLevel): string => {
  const prev = previousLevel(level)
  const lines: string[] = []
  for (const rule of RULE_CATALOG) {
    const now = getRuleSeverity(rule, level)
    if (now === undefined) continue
    const before = prev !== undefined ? getRuleSeverity(rule, prev) : undefined
    if (before === now) continue
    const change = before !== undefined ? `（Lv${prev}の${LABEL[before]}から変更）` : ""
    lines.push(`- ${rule.summary.ja} → ${LABEL[now]}${change}`)
  }
  const hasEarlier = prev !== undefined && getRulesForLevel(prev).length > 0
  if (lines.length === 0 && !hasEarlier) return "なし（このLvで検査する項目はない）"
  if (lines.length === 0) lines.push("- このLvで追加・変更される検査はない")
  if (hasEarlier) lines.push(`- Lv${prev}までの検査はすべて継続する`)
  return lines.join("\n")
}

/** そのLvで有効な全検査（英語・累積） */
const renderLevelAllEn = (level: ArchitectureLevel): string => {
  const items = [...getRulesForLevel(level)].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
  return [
    "Severity: 💡 Hint = information, ⚠️ Warning = likely problem, ❌ Error = violates this level's rules.",
    "",
    ...items.map(({ rule, severity }) => `- ${LABEL[severity]} — ${rule.summary.en}`),
  ].join("\n")
}

/** 全検査項目 × Lv の重大度一覧表（日本語） */
const renderMatrixJa = (): string => {
  const cols = LEVELS.filter((lv) => lv >= 2)
  const cell = (rule: RuleDefinition, lv: ArchitectureLevel): string => {
    const s = getRuleSeverity(rule, lv)
    return s === undefined ? "—" : ICON[s]
  }
  return [
    "凡例：💡 Hint（情報提供）／⚠️ Warning（問題の可能性が高い）／❌ Error（そのLvのルール違反）／— 検査しない",
    "",
    `| ID | 検査項目 | ${cols.map((lv) => `Lv${lv}`).join(" | ")} |`,
    `|---|---|${cols.map(() => "---").join("|")}|`,
    ...RULE_CATALOG.map(
      (rule) => `| \`${rule.id}\` | ${rule.summary.ja.replace(/\|/g, "\\|")} | ${cols.map((lv) => cell(rule, lv)).join(" | ")} |`,
    ),
  ].join("\n")
}

const requireLevel = (path: string, level: ArchitectureLevel | undefined): ArchitectureLevel => {
  if (level === undefined) throw new Error(`${path}: lv= の指定がない`)
  return level
}

const REFERENCE = join(ROOT, "docs", "ja", "Lv別アーキテクチャリファレンス.md")
const FW_DOC = join(ROOT, "docs", "ja", "🤤 僕の考えた最強の次世代Webアプリケーションフレームワーク（案）.md")

export const generateChecks = (): void => {
  const n1 = fillMarkers(REFERENCE, (kind, level) =>
    kind === "kaachan-matrix" ? renderMatrixJa() : renderLevelDiffJa(requireLevel(REFERENCE, level)),
  )
  const n2 = fillMarkers(FW_DOC, (_kind, level) => renderLevelDiffJa(requireLevel(FW_DOC, level)))
  let n3 = 0
  for (const level of LEVELS) {
    const path = join(ROOT, "rules", "_content", `lv${level}.md`)
    n3 += fillMarkers(path, (_kind, lv) => renderLevelAllEn(requireLevel(path, lv)))
  }
  console.log(`✓ generated checks: reference ${n1}, framework doc ${n2}, templates ${n3}`)
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  generateChecks()
}
