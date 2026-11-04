/**
 * Type-checks the TypeScript code blocks in the docs.
 *
 * The docs describe Slime FW, which does not exist yet, so most snippets call
 * APIs that have no real types. This check therefore tolerates "cannot find
 * name / module" and reports everything else:
 *
 * - syntax errors (broken snippets)
 * - type errors inside a snippet (a function called with the wrong arguments, etc.)
 * - "Cannot find name 'X'. Did you mean 'Y'?" — a typo of something the snippet defines
 * - misuse of this package: `@u83ism/architecture-rules` resolves to src/, so
 *   README examples are checked against the real exports
 *
 * Each code block is checked as its own module. To skip a block on purpose
 * (pseudo-code, an intentionally broken example), put this comment on the line
 * right before its opening fence:
 *
 *   <!-- doc-check: skip -->
 *
 * Usage:
 *   npx tsx scripts/check-doc-snippets.ts
 */

import { readFileSync, readdirSync } from "node:fs"
import { join, dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

/**
 * Docs whose code blocks are checked. qiita/ is generated from docs/ja, so it is left out.
 * Paths given on the command line replace this list.
 */
const cliPaths = process.argv.slice(2)
const TARGET_FILES =
  cliPaths.length > 0
    ? cliPaths.map((p) => resolve(p))
    : [
        join(ROOT, "README.md"),
        ...listMarkdown(join(ROOT, "docs", "ja")),
        ...listMarkdown(join(ROOT, "rules", "_content")),
      ]

/** Diagnostics that are expected from the way the docs write snippets */
const TOLERATED_CODES = new Set([
  // ---- the API is not real (yet) ----
  2304, // Cannot find name 'X'.
  2307, // Cannot find module 'X' or its corresponding type declarations.
  2503, // Cannot find namespace 'X'.
  2580, // Cannot find name 'require' / 'process' (node types)
  2582, // Cannot find name 'describe' / 'test' (test runner types)
  2584, // Cannot find name 'console' (no DOM lib)
  2591, // Cannot find name 'X'. Do you need to install type definitions for node?
  2593, // Cannot find name 'describe'. Do you need to install type definitions for a test runner?
  7016, // Could not find a declaration file for module 'X'.
  18004, // No value exists in scope for the shorthand property (`{ ... }` placeholder)
  // ---- an excerpt, not a whole file ----
  1108, // A 'return' statement can only be used within a function body. (a function body shown alone)
  2355, // A function whose declared type is ... must return a value. (body left out)
  2366, // Function lacks ending return statement (body left out)
  // ---- several files, or NG and OK versions, in one block ----
  2300, // Duplicate identifier 'X'.
  2393, // Duplicate function implementation.
  2395, // Individual declarations in merged declaration 'X' must be all exported or all local.
  2448, // Block-scoped variable 'X' used before its declaration.
  2451, // Cannot redeclare block-scoped variable 'X'.
  2454, // Variable 'X' is used before being assigned.
  // ---- unused names ----
  6133, // 'X' is declared but its value is never read.
  6192, // All imports in import declaration are unused.
  6196, // 'X' is declared but never used.
])

/**
 * `...` that stands for omitted code (`=> ...`, `{ ... }`, `Result<...>`, a line of `...`).
 * Spread and rest (`...args`, `...[a]`, `...(x)`) are followed by an operand, so they are left alone.
 * The placeholder is an unknown name, which is tolerated in both value and type positions.
 */
const ELLIPSIS_PLACEHOLDER = /\.\.\.(?=\s*(?:$|[)}\]>,;]|\/\/))/gm
const PLACEHOLDER_NAME = "__omitted__"

const SKIP_MARKER = "<!-- doc-check: skip -->"
const FENCE_OPEN = /^\s*```(ts|typescript|tsx)\s*$/
const FENCE_CLOSE = /^\s*```\s*$/

interface Snippet {
  /** Virtual file name given to the compiler */
  readonly virtualPath: string
  readonly docPath: string
  /** 1-based line of the first code line in the doc */
  readonly startLine: number
  readonly code: string
  readonly tsx: boolean
}

function listMarkdown(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(dir, name))
}

function extractSnippets(docPath: string): Snippet[] {
  const lines = readFileSync(docPath, "utf-8").replace(/\r\n/g, "\n").split("\n")
  const snippets: Snippet[] = []

  for (let i = 0; i < lines.length; i++) {
    const open = FENCE_OPEN.exec(lines[i] ?? "")
    if (!open) continue

    const skipped = lines[i - 1]?.trim() === SKIP_MARKER
    const body: string[] = []
    let j = i + 1
    while (j < lines.length && !FENCE_CLOSE.test(lines[j] ?? "")) body.push(lines[j++] ?? "")

    if (!skipped) {
      const tsx = open[1] === "tsx"
      snippets.push({
        // The compiler normalizes paths to forward slashes, so the key must match that form
        virtualPath: `${ROOT.replace(/\\/g, "/")}/__doc_snippets__/${relative(ROOT, docPath).replace(/[\\/]/g, "_")}-${i + 1}.${tsx ? "tsx" : "ts"}`,
        docPath,
        startLine: i + 2,
        // `export {}` keeps each snippet in its own module scope
        code: `${body.join("\n").replace(ELLIPSIS_PLACEHOLDER, PLACEHOLDER_NAME)}\nexport {}\n`,
        tsx,
      })
    }
    i = j
  }
  return snippets
}

/**
 * "Cannot find name 'X'. Did you mean 'Y'?" is a typo only when Y is something the docs define
 * (in the snippet or in src/). A suggestion from the standard library (StripeError → TypeError)
 * just means X is an API that is not real (yet).
 */
function isSuggestionFromLib(d: ts.Diagnostic): boolean {
  if (d.code !== 2552) return false
  const declaredIn = d.relatedInformation?.[0]?.file?.fileName ?? ""
  return declaredIn.includes("/node_modules/")
}

/** Node globals used by README examples. Full @types/node is not worth a dependency here */
const AMBIENT_PATH = `${ROOT.replace(/\\/g, "/")}/__doc_snippets__/ambient.d.ts`
const AMBIENT_CODE = "interface ImportMeta { resolve(specifier: string): string }\n"

function check(): number {
  const snippets = TARGET_FILES.flatMap(extractSnippets)
  const byPath = new Map<string, { readonly code: string }>(snippets.map((s) => [s.virtualPath, s]))
  byPath.set(AMBIENT_PATH, { code: AMBIENT_CODE })

  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    // Callbacks passed to APIs that do not exist yet have no contextual type
    noImplicitAny: false,
    // Without DOM, `Request` / `Response` / `print` in snippets do not silently bind to browser globals
    lib: ["lib.es2022.d.ts"],
    noEmit: true,
    skipLibCheck: true,
    jsx: ts.JsxEmit.Preserve,
    baseUrl: ROOT,
    paths: { "@u83ism/architecture-rules": ["src/index.ts"] },
    allowImportingTsExtensions: true,
  }

  const host = ts.createCompilerHost(options)
  const readFile = host.readFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  const getSourceFile = host.getSourceFile.bind(host)
  host.readFile = (path) => byPath.get(path)?.code ?? readFile(path)
  host.fileExists = (path) => byPath.has(path) || fileExists(path)
  host.getSourceFile = (path, languageVersion, onError, shouldCreate) => {
    const snippet = byPath.get(path)
    if (snippet) return ts.createSourceFile(path, snippet.code, languageVersion, true)
    return getSourceFile(path, languageVersion, onError, shouldCreate)
  }

  const program = ts.createProgram([...byPath.keys()], options, host)

  let errorCount = 0
  for (const snippet of snippets) {
    const sourceFile = program.getSourceFile(snippet.virtualPath)
    if (!sourceFile) throw new Error(`snippet was not loaded by the compiler: ${snippet.virtualPath}`)
    const diagnostics = [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...program.getSemanticDiagnostics(sourceFile),
    ].filter((d) => !TOLERATED_CODES.has(d.code) && !isSuggestionFromLib(d))

    for (const d of diagnostics) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(d.start ?? 0)
      const message = ts.flattenDiagnosticMessageText(d.messageText, "\n")
      console.log(`${relative(ROOT, snippet.docPath)}:${snippet.startLine + line}  TS${d.code}: ${message}`)
      errorCount++
    }
  }

  const fileCount = new Set(snippets.map((s) => s.docPath)).size
  console.log(`\n${snippets.length} code blocks in ${fileCount} files checked, ${errorCount} problem(s).`)
  return errorCount
}

process.exitCode = check() > 0 ? 1 : 0
