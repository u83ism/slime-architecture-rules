/**
 * docs/ja の文書から Qiita 投稿用の Markdown を生成する。
 *
 * 変換内容:
 * - Qiita に投稿済みの文書への相対リンク → Qiita 記事の URL（アンカーはそのまま）
 * - Qiita に投稿していない文書への相対リンク → リンクを外して文字だけにする
 *
 * Usage:
 *   npx tsx scripts/build-qiita.ts
 *
 * Output (gitignored):
 *   qiita/<文書名>.md   … Qiita の編集画面にそのまま貼り付ける
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const DOCS_DIR = join(ROOT, "docs", "ja")
const OUTPUT_DIR = join(ROOT, "qiita")

/** Qiita に投稿済みの文書と記事 URL の対応 */
export const QIITA_ARTICLES: Readonly<Record<string, string>> = {
  "🤤 僕の考えた最強の次世代Webアプリケーションアーキテクチャ（進化論）.md":
    "https://qiita.com/u83unlimited/items/86c9b0f5571e3e802ace",
  "🤤 僕の考えた最強の次世代Webアプリケーションフレームワーク（案）.md":
    "https://qiita.com/u83unlimited/items/8b0e5b51749ccdfde393",
  "Kaachan&Slime&Slime Architecture構想の設計根拠、補足資料.md":
    "https://qiita.com/u83unlimited/items/69a554c216d7b4bbc1b2",
}

const RELATIVE_LINK = /\[([^\]]*)\]\(\.\/([^)#]+\.md)(#[^)]*)?\)/g

/** 相対リンクを Qiita 向けに書き換える */
export const toQiitaMarkdown = (markdown: string): string =>
  markdown.replace(RELATIVE_LINK, (_whole, text: string, path: string, anchor: string | undefined) => {
    const url = QIITA_ARTICLES[decodeURIComponent(path)]
    return url !== undefined ? `[${text}](${url}${anchor ?? ""})` : text
  })

const buildQiita = (): void => {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  for (const name of Object.keys(QIITA_ARTICLES)) {
    const source = readFileSync(join(DOCS_DIR, name), "utf-8")
    writeFileSync(join(OUTPUT_DIR, name), toQiitaMarkdown(source), "utf-8")
    console.log(`✓ qiita/${name}`)
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildQiita()
}
