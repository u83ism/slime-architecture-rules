# 🤤 僕の考えた最強の次世代Webアプリケーションフレームワーク（案） v2.3.0
## 概要
TS製。既存の設計論と関数型プログラミングを参考に再設計されたWebアプリケーションスキーマ（と規定されたスケーリング方法）を元にした **設計解析＆改善提案プログラム（Linter＆自動refactor）** 及びアプリケーションFW（＆ツールキット）からなる。

- 最重要テーマは **「関数型プログラミングによる既存のアーキテクチャの解体と再構築」、「（オート）スケーリング」**
- **フロントエンドはSlimeの関心の外に置く**という方針を取る。詳細は後述するが、Slimeは「堅牢なAPIサーバー＋型の出力」に徹し、フロントエンドFWはSlimeをHTTP APIとして消費する疎結合な関係を維持する。

### 設計解析＆改善提案プログラム（設計Linter＆自動refactor） （仮称:Kaachan👩）
- 処理のパイプラインと層を意識した多段階アーキテクチャを前提に設計をアドバイス
    - 低レベル帯（Lv1-2）は既存のMVCフレームワークと処理の流れが似ているが、ファイル/フォルダ名が大きく変わる。Lv3以降は「Parse, don't validate」等、設計哲学の変化を伴う
        - 最初は1ファイルスタート、Parse / Workflow / Store / Client / Logic という処理順の層を段階的に追加し、その後ドメイン構造（App / domain / Shared 等）に移行するイメージ。スケーリングレベルが上がると制約も強まる
        - DBアクセス層（Store）と外部APIアクセス層（Client）はLv4で同時に導入する
- **コードがFatになってきたら検知**し、hint/warning/errorの3段階でがんがん指摘する。**自動でリファクタリング（過激すぎるのでオプション）は将来構想**
    - Fat Logic対策として、関数のドメインprefix混在検出に加え、**ts-morphによるAST解析で型依存グラフを構築し、互いに型依存が交差しない関数群を異なるドメイン候補として自動検出する**機能を持つ。静的解析でできる限界まで踏み込む姿勢がKaachanらしさ。
    - Lv6以降は**ドメイン間・層間の依存方向を静的検査**する（`dependency-cruiser`相当）。「ドメインAが依存宣言にないドメインBをimportしている」「WorkflowがORMを直接importしている」等の依存ルール違反をimportグラフ解析で自動検出。ルールはアーキテクチャレベルに連動して自動設定される。
    - opinionatedにがんがん指摘する挙動こそが「母ちゃん」たる所以
- **ドメイン分割は流石に静的なプログラムによる解析が厳しいので肥大化だけ指摘**。以下4点の理由による。
    - 既存のコーディングAIが比較的得意とする領域で重複してしまい静的プログラミングで対抗するのは負けがみえている
    - そもそもドメインに関する情報がリポジトリ等にない
    - 人間の方が誤ったor曖昧な認知をしている
    - AIが高度に抽象化した概念を生み出したとして人間が正しく認識できるとは限らない
    - ただし、`slime export:rules` で生成するrulesファイル経由でAIにドメインモデリングを促す指示を渡すという間接的なアプローチは取る（後述）
    - 静的解析では判断できなくても、AIには候補のまとまりと名前の提案を任せられる。最後の裁可は人間が持つ。AIの造語を人間が見抜けない問題には、名前に「既存語彙／AI造語」の出所ラベルを付けて対処する（[リファレンス「ドメインの命名・分割・統合」](./Lv別アーキテクチャリファレンス.md#ドメインの命名分割統合lv510共通)）

### FW及びツールキット（仮称:Slime💧）
Kaachanと設計解析＆改善提案プログラム（Linter＆自動refactor）と連携して各種コマンドを提供。

（Kaachanによる強制リファクタリングオプションを有効してなかったり、ドメインによるコード分割したいユーザー向け）大量のフォルダのリネームや移動を行うマイグレーション機能が充実。**これがスライムたる所以**

#### 汎用的な機能が簡単に導入できる仕組みや既存機能も大幅強化
##### 認証・セキュリティ系
- **2FA（二要素認証）の標準サポート**
    - TOTP（Google Authenticator等）・SMS・メールの複数手段を提供
    - LaravelはFortifyがオプション扱いで、TSのバックエンドFWではほぼユーザーランド実装
    - `slime.auth({ twoFactor: true })` のミドルウェアレベルで完結できる形を目指す
- **べき等性キー（Idempotency Key）**
    - 同一リクエストの重複実行防止（決済・注文等）
    - ほぼすべてのFWでユーザーランド実装。StripeがAPI設計指針として採用するくらい需要が高い
    - `Idempotency-Key` ヘッダーを検知→結果をキャッシュ→再送時に同じ結果を返す
    - Slimeのparse層・workflow層と組み合わせると非常に自然に実装できる
- **PIIマスキング（個人情報の自動マスキング）**
    - ログ・エラーレポートにメアドや電話番号が漏れるのを防ぐ
    - GDPR・個人情報保護法対応として需要が高いがほぼユーザーランド
    - 設定でマスキング対象フィールドを指定し、ログ強化と連動する

##### データ管理系
- **マルチテナンシーのサポート**
    - SaaSでは必須の「テナントごとのデータ分離」
    - LaravelはSpatie/laravel-multitenant頼み。他FWでも公式サポートは薄い
    - Row Level Security（PostgreSQL RLS）・スキーマ分離・DB分離の3パターンを設定で選択
    - リクエストスコープでテナントを自動注入する仕組みを提供
- **型安全なページネーション（カーソルベース対応）**
    - LaravelはページネーションがFW組み込みで非常に優秀。TSのFWではほぼユーザーランド
    - `findList({ cursor, limit })` → `{ data, nextCursor, hasMore }` の型付き返却
    - カーソルベース（大量データ向け）とオフセットベースの両対応
    - Lv4以降のStore層のfind系関数と自然に連携する
- **監査ログ（Audit Trail）**
    - 「誰が・いつ・何を・どう変更したか」の自動記録
    - Laravelはlaravel-auditというコミュニティパッケージ。コンプライアンス要件では必須
    - Lv8以降のcommand側workflowの層境界で自動フックできる構造と相性がいい
- **ファイルストレージ抽象化**
    - ローカル・S3・GCSを統一インターフェースで扱う
    - LaravelのFilesystemは非常に優れている。TSのFWではSDKを直接使うユーザーランド
    - Lv6以降のClient層Adapterとして実装するとSlimeのアーキテクチャとも整合する
- **ログ周りも強化**
    - デフォルトがJSON形式、ファイル書き出しの場合のログローテーションの標準対応等
- **メトリクスも標準装備**
    - **メトリクスはLv4以降、層の境界で自動計装（auto-instrumentation）する構想がある。** Workflow/Store/Client/Parse/Middlewareの各境界でFWが透過的にラップし、ユーザーが計測コードを一切書かずにメトリクスを取れる。OTel Collector経由でCloudWatch/Grafana/Datadog等へ転送（プラグイン設定）。AWSではCloudWatch EMF方式も選択肢。低Lvではstdout出力でも十分。

##### 開発体験（DX）系
- **環境変数の型安全バリデーション（起動時検証）**
    - 地味だが実用性が非常に高く、毎回ユーザーランドで実装するかゆい所の筆頭
    - LaravelはPHP的な型がないので当然なく、TSのFWでもほぼユーザーランド（t3-env等は近いが）
    - `slime.config.ts` にZodスキーマで環境変数の型と必須条件を定義→起動時に一括検証
    - 「本番で環境変数を設定し忘れていて起動後に初めて気づく」問題を根絶できる
- **DBシーダー・ファクトリー（`slime db:seed`）**
    - LaravelのSeeder/Factoryは非常に優秀。PrismaはSeedスクリプトはあるがFactory概念が薄い
    - Faker.jsと統合した型付きFactoryで開発・テストデータを宣言的に生成
    - `slime db:seed`・`slime make:factory` 等のコマンドを提供
- **API Playground（開発環境組み込みドキュメントUI）**
    - `slime export:openapi` で生成したOpenAPI specから `/docs` をdev環境で自動提供（Scalar等）
    - Laravelは標準なし（l5-swagger等が必要）。最近のFW（Hono等）はScalar連携が多い
    - `NODE_ENV=production` では自動無効化
- **CLIコマンド定義フレームワーク（ArtisanのCLI機能相当）**
    - LaravelのArtisanは非常に優れている。TSのバックエンドFWにはこれに相当する物がなく、Commander.jsを自前で組み込む必要がある
    - `slime make:command SendNewsletterCommand` で雛形生成、引数・オプションの型定義付き
    - バッチ処理・定期タスクとも自然に連携

##### インフラ・運用系
- **新機能の有効無効を制御するFeatureフラグ機能**
- **ヘルスチェック・Readiness Probe（自動エンドポイント提供）**
    - `/health`・`/ready` を自動で提供しつつカスタムチェック（DB疎通・外部API等）も追加できる
    - LaravelはSpatie/laravel-healthが必要。K8s・ECS等のオーケストレーター利用では必須
    - メトリクス標準装備と連動する
- **サーキットブレーカー / 指数バックオフリトライ**
    - 外部API・DBが不安定な時に自動で保護。障害の連鎖を防ぐ
    - ほぼすべてのFWでユーザーランド実装。Node.jsは特に薄い
    - Client層のAdapterと組み合わせて設定ベースで使える
    - `slime.client({ retries: 3, circuitBreaker: true })` 的なAPIを目指す
- **Graceful Shutdown（ゼロダウンタイムデプロイ対応）**
    - SIGTERM受信時に実行中のリクエストを完了してからシャットダウン
    - LaravelはサーバーのNginx/Apache任せ。Node.jsのFWでもユーザーランド実装が多い
    - `slime.withTransaction()`・`slime.defer()` の処理が途中で切れるリスクを防ぐ意味でも重要

##### API設計系
- **APIバージョニング（廃止管理付き）**
    - `/v1/`・`/v2/` の共存・廃止予告ヘッダー自動付与
    - Laravelにも基本的な仕組みはあるが廃止管理は薄い。他FWも大差なし
    - `Deprecation`・`Sunset` ヘッダーをルート定義の属性として指定できる
- **Inbound Webhook処理のサポート**
    - Stripe・GitHub・Slack等からのWebhook受信のお作法をFWレベルで整備
    - 署名検証・べき等性確認・イベントルーティングをまとめて面倒見る
    - LaravelはSpatie/laravel-webhook-client、TSはユーザーランド
    - 主要サービスはプラグインで提供（`@slime/webhook-stripe` 等）
- **Outbound Webhook管理**
    - 自分のサービスからユーザーのエンドポイントにWebhookを送る機能
    - 再送ロジック・署名生成・配信ログ・配信状況管理がセットで必要になる
    - LaravelはSpatie/laravel-webhook-server、TSはほぼユーザーランド
    - Hookdeck等の専用SaaSが存在するくらい需要が高い領域

##### その他
- **ユーザー管理の強化**
    - 単なるユーザーと認証だけでなく、ユーザーを束ねるグループ概念を導入
- **認可回りの強化**
    - roles/abiritiesを最初から用意して細かな権限管理対応
- **ソーシャルログイン対応**
    - オプションながら主要Idpは公式サポート、プラグインでその他も対応
- **通知周り強化**
    - ロギングと同じノリで使えるレベルまで整備する

## ターゲット層
- **スモールスタートが確定していて、スムーズなアップスケーリングが必要**
- Expressは薄い＆古い、Honoも薄い＆新しすぎ、Nest.jsは重厚長大＆OOP前提でTSの本流から外れていて微妙に感じている
- LaravelでFatController or FatModel、またはServiceクラス導入後のFat Serviceで苦しんでる～その先の規模で自前でスケーリングさせないといけなくて設計考えるの自信がない、レールが欲しいと思っている
- **設計マニア（革新派）**

## スケーリングについての対照表
アプリ規模はノリです。**Don't think.🧠Feel.♥️**

|アプリ規模（=Kaachanが認識/規定するレベル）|Laravel界隈の状況|Slimeの対応|
|--|--|--|
|1|公式対応してるが逆にリッチすぎ|公式対応/`route.ts` 1ファイルで実行可|
|2|公式対応してるが逆にリッチすぎ|公式対応|
|3|公式対応|公式対応|
|4-5|ユーザーランドの知恵で対応（Serviceクラス導入）|公式対応|
|6-8|ユーザーランドの知恵で対応（UseCase/Actionクラス導入、部分的にCA取り込もうとして失敗したりする）|公式対応|
|9-10|[頑張ってクリーンアーキテクチャやる](https://zenn.dev/yumemi_inc/articles/ebc6e634fa57a1),Laravel捨てる,マイクロサービス化等|公式対応|

## 大前提となる仮説
- **小～中規模のWebアプリケーションの設計については長年の知見でかなり煮詰まってきており、FWが一本のアップスケーリングのラインを規定してサポート（強要）することでDXが改善する**
- 大規模についても世に言われるほど「（同じコード規模で）プロダクトや仕様によって最適な設計が異なるので一般化できない」領域は少なく、意外とシェア食える（といいな……）

## 各レベルのKaachan/Slime対応

アーキテクチャ文書の各レベルに対応するKaachanの自動検知ルールと、Slimeが提供するAPIをまとめる。

> アーキテクチャルール（何を守るべきか）は[アーキテクチャ文書](./🤤%20僕の考えた最強の次世代Webアプリケーションアーキテクチャ（進化論）.md)参照。本セクションは「Kaachanがどう検知するか」「Slimeが何を提供するか」の詳細。
>
> 各Lvの「Kaachanのお叱りポイント」は、そのLvで新しく加わる検査と重大度が変わる検査の一覧。検査項目と重大度は共通定義パッケージの `src/rules-catalog.ts` で一元管理しており、この一覧もそこから自動生成している。

### Lv 2

#### Slimeが提供するもの
- `slime.auth()` - 認証・認可ミドルウェア（公式提供）。内部でDBアクセスをSlimeが面倒を見る
  - `slime.auth()` - 認証のみ
  - `slime.auth({ role: 'admin' })` - ロールベース認可
- カスタムMiddlewareは `middleware.ts` に定義してrouteに渡す

```ts
route.post('/profile', slime.auth(), UpdateProfileWorkflow)
route.get('/admin', slime.auth({ role: 'admin' }), GetAdminWorkflow)
route.post('/api', myCustomMiddleware, SomeWorkflow)
```

#### Kaachanのお叱りポイント
<!-- BEGIN GENERATED: kaachan-checks lv=2 （src/rules-catalog.ts から自動生成。手で編集しない） -->
- `/api` グループの外でAPIルートを定義している → 💡 Hint
- route のハンドラーがHTTPの入出力以外（store・logic・DBの呼び出し等）を行っている → 💡 Hint
- `workflow.ts` が認証ライブラリを直接importしている（Middlewareの仕事） → ⚠️ Warning
- `workflow.ts` が300行 / 10関数を超えている → 💡 Hint
- `workflow.ts` が500行を超えている → ⚠️ Warning
<!-- END GENERATED -->

---

### Lv 3

#### Slimeが提供するもの
- `slime export:schema` - `parse.ts`の型定義からフロントエンド向け型・Zodスキーマを自動生成。「バックエンドのparseを変えたらフロントのビルドが落ちる」という型安全の保証を担う
- `slime export:openapi` - route定義とparseスキーマからOpenAPI 3.x specを生成。外部チームや外部クライアント向けのAPI仕様書を別途手書き不要に
- `json(parse, workflow)` 等の応答形式の関数 - parseとWorkflowを組み合わせ、戻り値をJSONで返す。業務上の拒否はエラーコードの対応表を引いてProblem Details（RFC 9457）形式の4xxにする
- `DomainError` - Lv3〜4で業務上の拒否を表す型つきの例外（Lv5からはResult型で返す）

#### Kaachanのお叱りポイント
<!-- BEGIN GENERATED: kaachan-checks lv=3 （src/rules-catalog.ts から自動生成。手で編集しない） -->
- route のハンドラーがHTTPの入出力以外（store・logic・DBの呼び出し等）を行っている → ⚠️ Warning（Lv2の💡 Hintから変更）
- parse がDB/ORMモジュールをimportしている → ❌ Error
- workflow がHTTPのリクエスト・レスポンス・コンテキストに触れている → ⚠️ Warning
- workflow がparse関数を呼んでいる（parseはrouteで行う） → 💡 Hint
- workflow が `JSON.parse()` 等で入力を直接パースしている → ⚠️ Warning
- workflow が素の `Error` を投げている（業務上の拒否なら500になる。Lv3〜4は `DomainError`、Lv5以降は `err()` を使う） → ⚠️ Warning
- `slime.config.ts` がない（エラーコードとHTTPステータスの対応表を置く） → 💡 Hint
- `parse.ts` が300行 / 10関数を超えている（共通スキーマは許容） → 💡 Hint
- `parse.ts` が500行を超えている（`parse/` への分割を促す） → ⚠️ Warning
- `parse/` 内のファイルが300行を超えている → ❌ Error
- Lv2までの検査はすべて継続する
<!-- END GENERATED -->

---

### Lv 4

#### Slimeが提供するもの
- `slime.withTransaction(async () => { ... })` - 複数Storeをまたぐトランザクションをラップするユーティリティ。ORM固有のトランザクションAPIをWorkflowから隠蔽する。コールバックがthrowしたときに加え、Lv5以降でResultのerrを返したときもロールバックする

```ts
return slime.withTransaction(async () => {
  const user = await saveUser(valid)
  await saveAuditLog(user.id, "USER_CREATED")
  return user
})
```

#### Kaachanのお叱りポイント
<!-- BEGIN GENERATED: kaachan-checks lv=4 （src/rules-catalog.ts から自動生成。手で編集しない） -->
- workflow がORM/DBモジュールを直接importしている → ❌ Error
- workflow がORM固有のトランザクションAPIを直書きしている（`withTransaction()` を使う） → ⚠️ Warning
- store の関数名が命名規則（`find*` / `list*` / `get*` / `count*` / `search*` / `create*` / `save*` / `update*` / `delete*` / `remove*`）に違反している → 💡 Hint
- store がORM型を戻り値に使っている → ⚠️ Warning
- store がORM型やクエリビルダーを引数に取っている（storeの外でクエリを組み立てられてしまう） → ⚠️ Warning
- store の絞り込み条件が `{ column, op, value }` のような汎用の形になっている（業務の言葉の閉じた型にする） → 💡 Hint
- store の関数をループ（`for` / `forEach` / `map` 等）の中で呼んでいる（N+1になりうる。一括取得の関数を store に用意する） → 💡 Hint
- Lv3までの検査はすべて継続する
<!-- END GENERATED -->

---

### Lv 5

#### Slimeが提供するもの
- `ok(value)` / `err(error)` / `Result<T, E>` 型 - Result型のユーティリティ（neverthrow等の外部ライブラリでも代替可）
- 応答形式の関数（`json(...)`）のResult対応 - WorkflowがResultを返したら、okは2xx、errは対応表の4xx（Problem Details形式）にする。Lv5以降、業務上の拒否はthrowせずrouteまで戻り値で運ぶ

```ts
// slime.config.ts
export default {
  errors: {
    USER_ALREADY_EXISTS: 409,
    OUT_OF_STOCK: 422,
    PAYMENT_DECLINED: 402,
  } satisfies Record<DomainErrorCode, number>,  // 全コードの登録を型で強制
}
```

Slimeが自動カバーする範囲：Parse失敗→400 / Middleware拒否→401/403/429 / 業務上の拒否→対応表の4xx / 未捕捉throw→500。LogicはHTTPを一切知らなくて済む。

> **DomainError / TechnicalError の二分類**（[mpywさんの記事](https://zenn.dev/yumemi_inc/articles/ebc6e634fa57a1)の例外設計から着想）
>
> | 分類 | 意味 | HTTPコード |
> |---|---|---|
> | **DomainError** | 業務的な拒否（ビジネスルール違反）。Lv3〜4は `DomainError` のthrow、Lv5以降はResult err | 4xx |
> | **TechnicalError** | 未捕捉throw / DB障害等（技術的障害） | 500 |
>
> 業務上の拒否以外のthrowはすべてTechnicalError（500）として扱う。

#### Kaachanのお叱りポイント
<!-- BEGIN GENERATED: kaachan-checks lv=5 （src/rules-catalog.ts から自動生成。手で編集しない） -->
- logic が store / client / DB・ORMモジュールをimportしている → ❌ Error
- logic が throw している（Result型で返す） → ❌ Error
- logic関数にドメインprefixがない（`userCan*` 等） → ⚠️ Warning
- logic に対応するテストファイル（`logic.test.ts`）がない → ⚠️ Warning
- `logic.ts` が300行 / 10関数を超えている（`logic/` への分割を促す） → 💡 Hint
- `logic.ts` が500行を超えている、prefixが混在している、または型依存が交差しない関数群がある → ⚠️ Warning
- `logic/` 内のファイルが300行を超えている、またはprefixの混在が解消されていない → ❌ Error
- workflow が `DomainError` を投げている（Lv5以降は `err()` でrouteまで返す） → 💡 Hint
- Lv4までの検査はすべて継続する
<!-- END GENERATED -->

---

### Lv 6

#### Slimeが提供するもの
- 依存方向の静的検査（`dependency-cruiser`相当）がKaachanに組み込まれる。Lv6以降、アーキテクチャレベルに連動して検査対象が自動増加する
  - 「ドメインAが依存宣言にないドメインBをimportしている」
  - 「WorkflowがORMを直接importしている」等の依存ルール違反をimportグラフ解析で自動検出

#### Kaachanのお叱りポイント
<!-- BEGIN GENERATED: kaachan-checks lv=6 （src/rules-catalog.ts から自動生成。手で編集しない） -->
- store の関数名が命名規則（`find*` / `list*` / `get*` / `count*` / `search*` / `create*` / `save*` / `update*` / `delete*` / `remove*`）に違反している → ❌ Error（Lv5の💡 Hintから変更）
- store がORM型を戻り値に使っている → ❌ Error（Lv5の⚠️ Warningから変更）
- store がORM型やクエリビルダーを引数に取っている（storeの外でクエリを組み立てられてしまう） → ❌ Error（Lv5の⚠️ Warningから変更）
- workflow が `DomainError` を投げている（Lv5以降は `err()` でrouteまで返す） → ⚠️ Warning（Lv5の💡 Hintから変更）
- `domains/`・`orchestrate/` 直下のフォルダ名がkebab-caseでない → ⚠️ Warning
- 依存宣言にないdomain間のimport → ❌ Error
- domain間の依存宣言に循環がある → ❌ Error
- domainのstoreが、他domainの所有するテーブルに書き込んでいる → ❌ Error
- domainのstoreが、他domainの所有するテーブルを直接読んでいる（所有domainの関数を経由する。Lv10の読み取り側アダプターは除く） → ⚠️ Warning
- 1つのテーブルを複数のdomainが所有宣言している → ❌ Error
- domainのstoreが、所有の宣言されていないテーブルに触れている（`slime.config.ts` の `tables` に宣言する） → 💡 Hint
- `client/client.ts` を直接importしている（`client/adapter.ts` を経由していない） → ❌ Error
- domainのエラーコードにdomain名の接頭辞がない（`domains/user` なら `USER_*`） → ⚠️ Warning
- `shared/` がdomainフォルダをimportしている → ⚠️ Warning
- `shared/utility.ts` / `shared/smallLogic.ts` に副作用がある → ❌ Error
- `shared/` のファイルが肥大化している → ⚠️ Warning
- App層が肥大化している → ⚠️ Warning
- `app/store.ts` が存在する（App層はDBアクセスを持たない） → ⚠️ Warning
- `app/client.ts` が存在する（`client/` へ移動する） → ❌ Error
- App層がlogicを持っている（`app/logic.ts` またはビジネス判断の混在） → ⚠️ Warning
- `app/route.ts` にルート定義がある（`domains/xxx/routes.ts` へ移動する） → ⚠️ Warning
- `app/route.ts` が肥大化している → ⚠️ Warning
- ルート定義が存在しないWorkflowファイルを参照している（死んだルート候補） → ⚠️ Warning
- どのルートからも参照されていないWorkflowがある（到達不能Workflow候補） → 💡 Hint
- domainフォルダに `routes.ts` がない → 💡 Hint
- `sunset` 日付を過ぎたルートが残っている → ⚠️ Warning
- App層や `orchestrate/` が同じdomainの組を繰り返し一緒に呼んでいる（統合や境界の見直しを検討する） → 💡 Hint
- 中身の薄いdomainフォルダがある（他のdomainへの統合を検討する） → 💡 Hint
- Lv5までの検査はすべて継続する
<!-- END GENERATED -->

---

### Lv 7

#### Slimeが提供するもの
- `slime.defer(callback)` - post-commitフック
  - `slime.withTransaction()` 内で呼ぶ → **コミット成功後**に実行（ロック時間に含まれない）
  - `slime.withTransaction()` 外で呼ぶ → **メイン処理完了後**に in-process で即実行

```ts
return slime.withTransaction(async () => {
  const user = await saveUser(valid)

  slime.defer(async () => {
    await sendWelcomeMail(user.email)  // コミット後に実行
  })

  return user
})
```

#### Kaachanのお叱りポイント
<!-- BEGIN GENERATED: kaachan-checks lv=7 （src/rules-catalog.ts から自動生成。手で編集しない） -->
- logic に対応するテストファイル（`logic.test.ts`）がない → ❌ Error（Lv6の⚠️ Warningから変更）
- `shared/` のファイルが肥大化している → ❌ Error（Lv6の⚠️ Warningから変更）
- App層が肥大化している → ❌ Error（Lv6の⚠️ Warningから変更）
- `app/store.ts` が存在する（App層はDBアクセスを持たない） → ❌ Error（Lv6の⚠️ Warningから変更）
- App層がlogicを持っている（`app/logic.ts` またはビジネス判断の混在） → ❌ Error（Lv6の⚠️ Warningから変更）
- domainが `orchestrate/` フォルダをimportしている → ❌ Error
- `orchestrate/` フォルダ同士がimportし合っている → ❌ Error
- `orchestrate/` フォルダが `app/` をimportしている → ❌ Error
- `withTransaction()` 内に非DBの非同期処理（メール送信・外部API呼び出し等）がある（`defer()` を提案。opt-in） → 💡 Hint
- Lv6までの検査はすべて継続する
<!-- END GENERATED -->

---

### Lv 8

#### Kaachanのお叱りポイント
<!-- BEGIN GENERATED: kaachan-checks lv=8 （src/rules-catalog.ts から自動生成。手で編集しない） -->
- `shared/events.ts` が存在しない → ⚠️ Warning
- `shared/events.ts` がdomainや `orchestrate/` をimportしている → ❌ Error
- イベント型がクラスを含んでいる（純粋なデータ型のみ） → ❌ Error
- イベント型に `type` フィールド（discriminated union）がない → ⚠️ Warning
- イベント型の `type` が大文字スネークケースでない → ⚠️ Warning
- `orchestrate/` フォルダに `withTransaction()` がない（ドメインイベントで代替できるはず） → ⚠️ Warning
- `orchestrate/` フォルダがメール送信・外部API呼び出し等の非トランザクション処理を含んでいる → ⚠️ Warning
- Lv7までの検査はすべて継続する
<!-- END GENERATED -->

---

### Lv 9

#### Kaachanのお叱りポイント
<!-- BEGIN GENERATED: kaachan-checks lv=9 （src/rules-catalog.ts から自動生成。手で編集しない） -->
- `infrastructure/` フォルダが存在しない → ⚠️ Warning
- domainフォルダが `infrastructure/` を直接importしている → ❌ Error
- ORM/DBモジュールのimportが `infrastructure/` 以外にある → ❌ Error
- `ports.ts` に実装コードがある（型定義のみ） → ❌ Error
- `store.ts` がまだ残っている（`ports.ts` と `infrastructure/` に分離する） → ❌ Error
- `ports.ts` があるのに、workflowがPortを引数で受け取っていない → 💡 Hint
- Lv8までの検査はすべて継続する
<!-- END GENERATED -->

---

### Lv 10

#### Kaachanのお叱りポイント
<!-- BEGIN GENERATED: kaachan-checks lv=10 （src/rules-catalog.ts から自動生成。手で編集しない） -->
- domainフォルダに `command/` と `query/` がない → ⚠️ Warning
- `command/` が `query/` をimportしている（ReadPortを含む） → ❌ Error
- `query/` がWritePortや書き込み用アダプターをimportしている → ❌ Error
- `query/` が書き込み操作を行っている → ❌ Error
- `command/` のworkflowが読み取り最適化ビューモデルを返している → ⚠️ Warning
- `query/` の1ファイルに複数のクエリがある（1ファイル1クエリ） → ⚠️ Warning
- `query/` 内で共通化されたヘルパーが複数のクエリファイルから使われている → ⚠️ Warning
- `query/` がドメインのlogicをimportしている（ReadPortと読み取りモデルだけを使う） → ⚠️ Warning
- `query/` のファイルが肥大化している → 💡 Hint
- Lv9までの検査はすべて継続する
<!-- END GENERATED -->

---

### Kaachanの依存方向静的検査（Lv6以降）

`dependency-cruiser`相当のドメイン間・層間依存方向チェックをKaachan内で実行する設計（Lv6以降）。アーキテクチャレベルに連動して検査対象が自動増加する。`dependency-cruiser`組み込みか独自実装かは要検討。

| Lv | 追加される検査 |
|---|---|
| 6 | 依存宣言にないdomain間参照の禁止・依存宣言の循環禁止 |
| 7 | orchestrate/からApp、domainからorchestrate/への参照禁止 |
| 9 | domain→infrastructure直依存禁止 |
| 10 | command→query Port参照禁止 |

---

## 残課題
### Level間のマイグレーション戦略
`slime migrate --to-level 6` でLvを移行する中核機能。ファイル構造の解析・ディレクトリ生成・ファイル移動・importパス自動修正・曖昧なファイルのインタラクティブ確認を行う。「移動後に壊れる参照の自動修正」（LSP/ts-morph活用）が最大の実装難所。これがスライムたる所以（形を変えながら成長する）。

```bash
slime migrate --to-level 6    # Lv6に移行（実ファイルを変更）
slime migrate --dry-run       # 変更内容の事前確認（実ファイル変更なし）
slime level:next              # 次のLvのディレクトリ構造を確認
slime level:current           # 現在のLvを解析・表示
```

ドメイン分割時に「このファイルはどのdomainか」が自動判断できない曖昧ファイルは、インタラクティブCLIで一つずつユーザーに確認する方式で対処する。

### ドメインごとのレベルオーバーライド機能の是非

複数のドメインがあるとき、特定のドメインだけ肥大化するのはよくあること、という前提がある。これに対し、「ドメインAだけLv7の制約を先行適用する」といったドメイン単位の成熟度設定（例: `domain.user.level: 7`）を設定ファイルで明示的に指定できる仕組みのアイデアがある。

ただでさえ「同じFWなのにアーキテクチャが複数ある」という状態でチーム内のコミュニケーションコストが上がっているのに、更にドメインごとにレベルが異なるとなると混乱を招く可能性が高い。「推奨はしないが、やるなら `slime.config.ts` で `domain.payment.level: 9` と明示せよ」という**許容する禁じ手**として最初から位置付けておくことも一つの選択肢だが、文書公開後のコミュニティの反応（「本当にこの粒度でオーバーライドしたい需要があるのか」）を見てから判断したい。

### Fat Parse問題

`parse.ts` もFat Logicと同じ肥大化リスクを持つ。Lv6以降でドメインが増えると各ドメインのparseが1ファイルに混在する。`logic/`中間昇格と同パターンで対処（`parse/createUser.ts`等）。Kaachanの閾値・エスカレーションはlogicと同方針。共通化は許容し肥大化のみ検知する。

## AIとFWとアーキテクチャの関係について

**SlimeおよびKaachanはFW側からAIを呼び出す設計をしない**という方針です。理由は2つ。

**1. 関係が逆転している**
現在ユーザーランドで起きていることを見れば、AIがFWを使う側。開発者がAIに「このコードをSlimeのLv6構造に直して」と頼む、というのが自然な流れです。FWがAIを呼び出すということは、この関係を逆にすることを意味します。

**2. 二重になり工数対効果が疑問**
ユーザーはすでに「AIに相談しながらFWを使う」という形でAIを活用しています。FW側でもAIを呼び出すとなると、同じ判断をAIが二重に行う構造になります。ドメインの切り出し判断のようにビジネス知識が必要な領域は、ユーザー側のAIに委ねれば十分であり、FW側で抱え込む必要はないかなと。

KaachanができることはあくまでもAST解析・静的解析の範囲に留め、「AIに相談するタイミングを知らせる（肥大化検知→hint）」という間接的な役割に徹する。

ただ逆方向、すなわち**FWがAIの入力として機能するための出力**は積極的に提供すべきだと考えています。具体的には、現在のアーキテクチャレベルに応じた **rulesファイル**（`.cursor/rules`・`CLAUDE.md`等のAIコーディングアシスタント向け制約定義）や **skillsファイル**（AIがSlimeのコマンドや構造を理解するためのコンテキスト定義）の出力機能はあってしかるべきだと思います。

```bash
slime export:rules   # 現在のLvに応じたrulesファイルを生成（.cursor/rules・CLAUDE.md等）
slime export:skills  # AI向けのSlime構造・コマンドのコンテキストを生成
slime export:schema  # parse.tsの型定義からフロントエンド向け型・バリデーションスキーマを生成
slime export:openapi # route定義とparseスキーマからOpenAPI 3.x specを生成
slime level:next     # 次のLvのディレクトリ構造を確認（Lv移行の準備に）
```

これにより「AIがFWを使う」という本来の関係を強化できる。FW→AIではなく、**FWがAIの文脈を整備する**という役割分担。


## フロントエンドの扱い方針

### アーキテクチャ視点：出力境界の対称性

Slimeのアーキテクチャはすでに**入力境界（Parse層）**を明示しているが、出力境界は今まで暗黙のままだった。フロントエンドとの関係を整理するにあたり、出力境界も明示する。

```
[HTTP req] → Parse（入力境界） → Workflow → Response（出力境界） → [HTTP res]
```

Workflowが返すのは純粋なデータであり、どのフォーマットで返すかはResponse層の仕事。Laravelの `response()->json()` / `response()->download()` / `view()` と同じ発想で、以下が並列で扱える：

```ts
route.get('/users',         json(GetUsersWorkflow))       // JSON（REST API）
route.get('/report/export', stream(ExportReportWorkflow)) // ファイルダウンロード
route.get('/og/:id',        html(OgImageWorkflow))        // 静的HTML
route.get('/feed',          sse(NotificationWorkflow))    // Server-Sent Events（サーバープッシュ）
route.ws('/chat',           ws(ChatWorkflow))             // WebSocket
```

**Workflow/Logic/Store/Portの層は一切変わらない。変わるのはRoute定義のResponse形式だけ。** これはParse層が「HTTPから来たかバッチから来たかをWorkflowに知らせない」のと対称的な設計だ。

### FW視点：フロントエンドはSlimeの外

SlimeはフロントエンドFWの選定・実装に関与しない。フロントエンドとの接点は以下の2コマンドに限定する：

```bash
slime export:schema  # parse.tsの型定義からフロントエンド向け型・Zodスキーマを生成
slime export:openapi # OpenAPI 3.x specを生成（外部チーム・外部クライアント向け）
```

これにより「バックエンドのparse.tsを変えたらフロントのビルドが落ちる」という型安全の保証はSlimeが担いつつ、フロントエンドFWの流行り廃り（Next.js Pages Router vs App Router等）からSlime本体を守れる。

#### Next.jsとの関係について補足

Next.jsのApp RouterはRSC（React Server Components）という仕組みを使い、サーバーとクライアントの間でHTTP streamingによるコンポーネントツリーの送受信を行う。「WebSocketで密接にやりとりしている」ように見えるが、プロダクション環境のメカニズムはあくまでHTTP streamingとHTTP POST（Server Actions）であり、WebSocketではない（WebSocketが使われるのは開発時のHMRのみ）。

Next.jsの「サーバーとクライアントの境界が曖昧になる」設計はSlimeのアーキテクチャと相性が悪いため、**SlimeはNext.jsと疎結合なAPIサーバーとして関わる**のが自然な姿だ。SSR/RSCとの密結合が必要な場面は `@slime/adapter-nextjs` 等のプラグインで対応する方針とし、コア本体には取り込まない。


### rulesファイルによるドメイン分割問題、マイグレーション問題への間接介入

静的解析の限界（ドメインの切り方・マイグレーション）に対し、rulesファイル経由でAIに間接的に介入させる設計。「FWからAIを呼ぶ」のではなく「FWがAIの動く前提条件（rulesファイル）を整備する」構造なので方針と矛盾しない。KaachanのHintと同じ閾値をrulesファイルに含め、「Kaachanが警告→AIが提案」という一貫したメッセージを提供する。フォーマット（`.cursor/rules`・`CLAUDE.md`等）対応方針は未定。


## ‼️【One more thing...】Infra-Slime（構想）

`slime eject infra --level N` でアーキテクチャレベルに最適なDockerfile/Terraform/CDKを生成する構想。コードのスケールにインフラもスケールする一気通貫の提供が強み。既存のFWにはない「コードのスケールにインフラもスケールする」一気通貫の提供がSlimeならではの強みになりうる。

| レベル帯 | 推奨インフラ構成 |
|---|---|
| Lv 1-3 | SQLite + シングルコンテナ（Docker Compose 1つ。VPS 1台で完結） |
| Lv 4-7 | PostgreSQL + Redis + アプリコンテナ（DBとアプリを分離。マネージドDB推奨） |
| Lv 8+ | マネージドDB + キューサービス + サーバーレス/k8s（クラウドネイティブ構成） |

各クラウドは `@slime/infra-aws` 等のプラグイン提供予定。ただしレベルだけでは最適なインフラは決まらない（Lv3でも100万ユーザーいれば別構成が必要）ため、Lv基準の推薦はあくまでテンプレートの提示に留め、本格的なクラウド最適化は外部エコシステムに委ねる。2026年2月にAWSが公開した`deploy-on-aws`プラグインは、コードベースを解析してAWSサービス推薦・CDK生成を行う機能を持ち、SlimeがLevelとメトリクスのコンテキストを出力（`slime export:infra-context`）することで連携できる。

> gemini-3-pro-previewが突然言い出した発想で、Claude 4.6 Sonnetも衝撃を受けました。（他人事）


## 執筆者の背景
- **既存の設計理論に弱い（おい！）**
    - DDDやクリーンアーキテクチャ、レイヤードアーキテクチャはネットや人の話等で触りだけしか知らん
    - このため後編のアーキテクチャ構築ではChatGPTとClaudeとトータル20時間以上議論＆レッスンを受けることに……
-  [TS信者で関数型プログラミングによる、既存のOOPの影響を強く受けた設計論（ないし設計論を背景とした実装論）の解体・再構築に強い関心がある](https://qiita.com/u83unlimited/items/834131fba97438323706)
 
- [倒産寸前の零細レガシーIT企業](https://qiita.com/u83unlimited/items/43f22a36b618d1778fcc)～ベンチャー～小企業（吸収合併）～中企業（親会社）と移ってきており、個人開発レベル～中規模（[mpywさんの提唱する「なんちゃってクリーンアーキテクチャ」](https://zenn.dev/yumemi_inc/articles/ce7d09eb6d8117)で何とかなるレベル）のWebアプリケーション開発に特化
    - このためアップスケーリングについて考えさせられたり設計、実装する機会が滅茶苦茶多い
- フルスタックエンジニア = Laravel経験は6年程度あって主要機能は触ってるので、不満や潜在需要は理解して言語化できるつもり


# アーキテクチャ編
https://qiita.com/u83unlimited/items/86c9b0f5571e3e802ace

# 補足事項
https://qiita.com/u83unlimited/items/69a554c216d7b4bbc1b2
