# 💧 Slime FW 詳細設計

> **位置づけ：** 本ドキュメントはSlime FWの機能実装詳細を記録する開発用資料。概要は [フレームワーク（案）](./🤤%20僕の考えた最強の次世代Webアプリケーションフレームワーク（案）.md) を参照。

---

## メトリクス自動計装

### 設計構想

Slime Architectureは「DBアクセスが必ずstore.tsを通る」「外部APIが必ずclient.tsを通る」「ユースケースが必ずWorkflowを通る」という構造をFWが強制しているため、各境界でFWが透過的にラップすることで、ユーザーが計測コードを一切書かずにメトリクスを取れる可能性がある。Laravelのクエリロギングと同じ発想だが、DB以外の境界（外部API・Workflow）もカバーできる点がSlimeの強み。

### 自動取得できるメトリクスのイメージ

| 境界 | 取得メトリクス |
|---|---|
| Workflow | 実行時間・成功/エラー率 |
| Store | クエリ時間・件数・スロークエリ検知 |
| Client | HTTPステータス・レイテンシ・タイムアウト率 |
| Parse | バリデーションエラー率 |
| Middleware | 認証失敗率・レートリミット発火数 |

### アーキテクチャレベルとの連動

アーキテクチャのLvが上がると自動計装の対象境界も増える：

- **Lv1-3**：Workflow単位のみ（WorkflowはLv2から存在する）
- **Lv4**：Store/Clientが分離されるタイミングでこれらも自動計装対象に加わる
- **Lv6以降**：ドメイン別のWorkflow/Storeが分かれるので、ドメイン別のメトリクスが自然に取れるようになる

### メトリクス転送先とコスト問題

アプリがメトリクスを直接CloudWatch等に送ると「API呼び出し数 × データ点数 = 莫大なコスト」になる。

#### OpenTelemetry（OTel）方式（メイン戦略）

現代的な解法は**OpenTelemetry（OTel）Collectorを間に挟む**ことで：
1. アプリはローカルのCollectorに投げるだけ（ほぼタダ）
2. Collectorが1分間分を集約・バッチしてから送信（API呼び出し数を激減）

Slime本体はOTel SDKを抱えて「ローカルのCollectorに投げる」までを担当し、Collector以降のルーティング（CloudWatch / Grafana / Datadog等）はプラグインとユーザー設定に委ねる：

```
Slimeアプリ → OTel Collector（ローカル） → [CloudWatch / Grafana / Datadog]
                                                 ↑ @slime/metrics-* プラグインで設定
```

バックエンドを後から差し替えられる・複数同時送信できる点もこの設計の利点。

#### CloudWatch EMF方式（AWSに閉じる場合の代替）

**CloudWatch EMF（Embedded Metric Format）**：CloudWatch Logsへの構造化JSON書き込みからメトリクスを自動抽出する仕組みで、PutMetricData APIより安くログとメトリクスを同時に取得できる。

#### 低レベル帯のデフォルト

低Lvでは「Stdoutに出すだけ（ファイルローテーションはOSのlogrotateやDockerのlog driverに任せる）」でも十分。OTel Collector接続はLv4以降でRepository/Clientが分離されて自動計装の恩恵が出始めるタイミングが自然な導入機会。

---

## Level間マイグレーション戦略

### 位置づけ

Slimeの最大の価値提案は「スムーズなアップスケーリング」だが、その中核機能となるLevelマイグレーションの実装難度が高く、詳細が未定。これがスライムたる所以（形を変えながら成長する）であり、**実現できれば差別化機能として最強だが、実装難易度がFW全体で最も高い可能性がある**。

### コマンドインターフェース

```bash
slime migrate --to-level 6    # Lv6に移行
slime migrate --dry-run       # 変更内容の事前確認（実ファイル変更なし）
slime level:next              # 次のLvのディレクトリ構造を確認
slime level:current           # 現在のLvを解析・表示
```

### 移行時に行うこと（概念的には明確）

1. 現在のファイル構造を解析してLvを判定
2. 移行先Lvのディレクトリ構造を生成
3. ファイルを移動
4. importパスを自動修正
5. 移動先が曖昧なファイル（どのdomainに入れるかなど）はインタラクティブに確認

### 最大の難所

**3〜5の「移動後に壊れる参照の自動修正」をどう実現するか**が最大の難所。方向性：

| 手段 | 内容 | 課題 |
|---|---|---|
| LSP（Language Server Protocol） | TypeScript Language Serverにimport解析を委ねる | LSPとの統合が複雑 |
| ts-morphによる静的解析 | AST解析でimportパスを書き換え | 動的import・型のre-exportに弱い可能性 |
| 組み合わせ | LSP + ts-morph両方使う | 実装コスト大 |

実装として成立するかは要検証。

### ドメイン分割時の曖昧ファイル問題

`slime migrate --to-level 6` でドメインを切る際、「このファイルはuserドメインかorderドメインか」をFWが自動判断するのは困難。対応案：

1. **インタラクティブCLI**：曖昧なファイルをリストアップし、一つずつユーザーに確認
2. **prefixヒューリスティック**：関数名のprefix（`userCan*`等）から候補を提示（確定はしない）
3. **AIコンテキスト出力**：`slime export:migrate-context` で曖昧ファイルリストをAI向けに出力し、AIと対話しながら決定

---

## Infra-Slime（構想）

> 💧Slimeはコードのアーキテクチャだけでなく、**インフラ構成もアプリのレベルに合わせてスケールさせる**という構想。「母ちゃんの言う通りにしておけばサーバーは落ちない」を実現するやつだ。

### コマンドとレベル対応表

```bash
slime eject infra --level 5  # 現在のレベルに最適なインフラ定義を吐き出す
```

| レベル帯 | 推奨インフラ構成 |
|--|--|
| Lv 1-3 | SQLite + シングルコンテナ（Docker Compose 1つ。VPS 1台で完結） |
| Lv 4-7 | PostgreSQL + Redis + アプリコンテナ（DBとアプリを分離。マネージドDB推奨） |
| Lv 8+ | マネージドDB + キューサービス + サーバーレス/k8s（クラウドネイティブ構成） |

このコマンドで、現在のレベルに最適な `Dockerfile` や `Terraform` / `CDK` のコードを生成する。アーキテクチャレベルとインフラ構成を対応させるという発想自体が既存のFWには存在しておらず、**「コードがスケールすればインフラもスケールする」を一気通貫で提供できる**のがSlimeならではの強みになりうる。

各クラウドプロバイダーごとに実装が大きく異なるため、コアFWには組み込まず **`@slime/infra-aws`・`@slime/infra-gcp`・`@slime/infra-fly` 等のプラグイン** として提供する方針（本体との依存関係を切り離す）。

> ……というのをいきなりgemini-3-pro-previewが言い出して、Claude 4.6 Sonnetも衝撃を受けて検討する価値があると纏めてくれました。実用レベルに達するかどうかはともかく、「FWがインフラを提示する」という発想が無かったのでたまげたなぁ。IaC時代の発想だと思った。（他人事）

### 欠点と補完案

**欠点：** レベルだけでは最適なインフラは分からない。アプリ規模Lv3でも100万ユーザーいれば別の構成が必要なように、**実際の負荷によって最適解が変わる**。レベル基準の推薦はあくまでテンプレートの提示にとどまる。

**補完案：メトリクスとの連携**

```bash
slime export:infra-context  # Level + メトリクスサマリーを1ファイルに出力
```

メトリクスから読み取れるボトルネックの例：

| メトリクス | 推論できること |
|--|--|
| DBクエリ時間が高い | 読みレプリカ or Redisキャッシュの追加 |
| DB時間は正常だがレスポンスが遅い | アプリサーバーのスケールアウト |
| 特定エンドポイントへの集中 | CDN・エッジキャッシュの導入 |
| メモリ使用率の右肩上がり | インスタンスサイズアップ or メモリリーク疑い |

ただしSlime自身がメトリクスを解析してインフラを推薦する（＝FWがAIを呼ぶ）設計はしない。あくまで `slime export:infra-context` でLevel情報とメトリクスサマリーをファイルとして吐き出し、**AIエージェントがそれを読んで判断する**という構造を維持する。

### AWS向け実装の現状（2026年2月時点）

2026年2月、AWSが [Agent Plugins for AWS](https://aws.amazon.com/blogs/developer/introducing-agent-plugins-for-aws/)（`deploy-on-aws`プラグイン）をOSSとして公開した。このプラグインはClaudeCodeやCursor等のコーディングエージェントに「コードベースを解析して最適なAWSサービスを推薦→コスト試算→CDK/CloudFormation生成」を行うスキルを追加するMCPサーバー群で、まさにInfra-Slimeがやりたかった領域をAWS自身がカバーし始めている。

`slime export:infra-context` でSlimeのLevelとメトリクスをコンテキストとして吐き出せば、deploy-on-awsプラグインのAnalyzeフェーズがそれを読んでより精度の高い推薦を行える。**`@slime/infra-aws` を自前で実装・維持するより、deploy-on-awsプラグインにAWS側の判断を委ねてSlimeはコンテキスト提供に徹する方がコスパがいい可能性がある。**

**住み分けの方針：**
- Lv基準の軽量テンプレート生成（Dockerfile・docker-compose.yml）はプラグインの有無に関わらず有用なため残す
- 本格的なクラウド最適化は外部エコシステムに任せる
