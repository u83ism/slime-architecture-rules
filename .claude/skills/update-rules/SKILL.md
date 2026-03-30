---
name: update-rules
description: docs/ja/ のドキュメントを読み、rules/_content/ 以下のAI rulesテンプレートを最新の設計に同期させる。ドキュメントとテンプレートの乖離を検出・修正したいときに使う。
---

# update-rules

`docs/ja/` 以下の設計ドキュメントをすべて読み、`rules/_content/lv1.md` 〜 `rules/_content/lv10.md` を最新の設計に同期させてください。

## 手順

### Step 1 — ドキュメントを読む

`docs/ja/` 以下の全ファイルを読んでください。以下に注目します：

- 各Lvで導入されるファイル・フォルダとその責務
- 各レイヤーの「やること・やらないこと」ルール
- Kaachanが静的検査する項目（Hint / Warning / Error の閾値を含む）
- 命名規則（`find*`, `save*`, `userCan*`, `domain[A-Z]` など）
- 依存方向ルール（何が何をimportしていいか・いけないか）
- AI向けのガイダンスとして有用な設計判断の根拠

### Step 2 — 現在の _content/ を読む

`rules/_content/lv1.md` 〜 `rules/_content/lv10.md` を読んでください。

### Step 3 — 差分を分析する

ドキュメントと現在のテンプレートを比較して、以下を洗い出してください：

- **抜けているルール**：ドキュメントに書かれているがテンプレートに反映されていないもの
- **古くなったルール**：テンプレートの記述がドキュメントの最新設計と矛盾するもの
- **追加すべきガイダンス**：AIアシスタントが知っておくべき設計判断の根拠でテンプレートにないもの

差分の一覧をまず提示し、各変更がどの `_content/lv*.md` に影響するかを示してください。

### Step 4 — ユーザーに確認する

変更内容の概要を提示して、実際に更新してよいか確認を取ってください。

### Step 5 — _content/ を更新する

承認を得たら、該当する `rules/_content/lv*.md` を更新してください。

更新時の注意：
- テンプレートは**累積型**です。Lv5のテンプレートはLv1〜4のルールも含みます。あるルールをLv3に追加した場合、Lv4〜10にも同じルールが引き継がれているか確認してください。
- `_content/` ファイルは**英語**で記述してください。
- 既存の構造（Project Structure / Layer Rules / Error Handling / What Kaachan Checks / Guidance for AI Assistants / Next Step）を維持してください。
- ドキュメントに書かれていない推測や補完は行わないでください。

### Step 6 — ビルドして反映する

```bash
npm run build:rules
```

を実行して、ツール別フォルダ（`claude/`, `codex/`, `gemini/`, `cursor/`）に変更を反映してください。
