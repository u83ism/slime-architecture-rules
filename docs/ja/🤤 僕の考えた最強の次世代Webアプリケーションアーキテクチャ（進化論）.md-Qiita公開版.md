# 🤤 僕の考えた最強の次世代Webアプリケーションアーキテクチャ（進化論） v1.3.0
## 👀 FW編
以下の記事を読まないと一部意味が分からないと思います。あとコードは簡易的な概念コードなのでノリで読んでください。**Don't think.🧠Feel.♥️**

https://qiita.com/u83unlimited/items/8b0e5b51749ccdfde393

## 💭 概要
- **多段階からなる、色んな設計理論やノウハウの段階的導入/統合設計論になっています。**
- 本ドキュメントは「正しい完成形を最初から強制するアーキテクチャ論」ではなく、「**知らずに正しい設計へ段階的に誘導するアーキテクチャ論**」です。理論的な純粋性よりも学習曲線と現場の現実を優先した設計判断が含まれており、各Lvの制約はその妥協点を意図的に記録したものである。理論家からの「DDDの定義と違う」「Repository Patternとして不完全」等の指摘は、この前提を踏まえた上で読んでほしい（詳細は末尾の「補足資料」参照）
- 本ドキュメントは**FW非依存のアーキテクチャ論**として成立するよう設計されています。SlimeというFWがこの設計論を実装・強制するために作られていますが、本ドキュメントの内容はSlimeなしでも任意のFW上で手動実装できます。
  - SlimeおよびKaachanによる具体的な実装・自動検知・強制の詳細は[FW文書](https://qiita.com/u83unlimited/items/8b0e5b51749ccdfde393)を参照してください
- 前編でも書いた通り、Laravelから強い影響を受けています。
- **「関数型プログラミングの影響を受けて解体/再構築されたクリーンアーキテクチャをCQRSパターンを組み込んで拡張した形態」がゴール**
   - 現状、メジャーな大規模Webアプリ設計理論がここまでしか存在しないため
   - なお著者はLv6-7相当までしか業務で携わっていないため、Lv8以降がこれで機能するのか自信がなく、理論を落とし込むことに集中している
   - 「高レベルの一部の内容はもっと早めの方がいいんじゃね（低レベルに下ろしてきた方がいいんじゃね）」とかは全然出てくると思いますが、学習曲線とか考慮してこのレベル分けにしてるので単純に下に下ろすのはどう考えても厳しい……

## 🗺️ 全体アーキテクチャ俯瞰図

| Lv | 構造スナップショット | テーマ・設計理論との接続 |
|---|---|---|
| 1 | `route` | ルーティングのみ。FWの最小単位 |
| 2 | `route` → `Middleware` → `Workflow` | MVC的なControllerをWorkflowとして再定義。MiddlewareでHTTPゲート処理を分離 |
| 3 | `route` → `Middleware` → `Parse` → `Workflow` | **「Parse, don't validate」** 原則の導入。Parse層がHTTP境界を担い、WorkflowをHTTP依存から切り離す |
| 4 | `Workflow` → `Store`(query*/command*命名) / `Client` | **レイヤードアーキテクチャ**の確立。Query/Command命名規則でCQRS的な読み書き意識の芽を植える |
| 5 | + `Logic`（純粋関数・Result型） | **Decision Objectパターン**の導入。Result型（Railway Oriented Programming）で例外を排除し、ビジネス判断を副作用なし関数に閉じ込める。**Functional Core, Imperative Shell**（Gary Bernhardt）の萌芽 ── Logicが純粋なコア、Workflowが命令型のシェルになる構造が始まる |
| 6 | `App` / `Domain(s)` / `Shared` / `Client`(+`Adapter`) | **ドメイン駆動設計（DDD）** 本格導入。腐敗防止層（ACL）によるclient/adapter分離。ドメイン間相互参照禁止 |
| 7 | + `cross-Domain` / Logicテスト義務化 | ドメイン間調整を`cross-`フォルダとして構造化。階層制約でドメインの依存方向を強制。post-commitフックによる副作用の外出し |
| 8 | + `shared/events.ts` / `cross-`がTx専用化 | **ドメインイベント**（DDD）の導入。副作用（失敗許容）とトランザクション（原子性必須）を構造で分離。戻り値方式でイベントの可視性を保証 |
| 9 | + `Domain/ports.ts` / `infrastructure/Adapters` | **ヘキサゴナルアーキテクチャ（Ports & Adapters）** の関数型実装。DIコンテナ・class不要で依存逆転（DIP）を実現。domainからORMへの直接依存が消える。Lv5から始まった**Functional Core, Imperative Shell**が構造として完成。**関数型クリーンアーキテクチャの完成** |
| 10 | `Domain/command/` + `Domain/query/` + `Infrastructure` | **CQRS**（Greg Young型）の軽量導入。読み書きモデルをフォルダ構造で分離。CAとは独立した別軸のパターンをPorts & Adapters上に統合した**本ドキュメントのゴールの完成形** |

---

## Lv 1
ルーティングだけ。どこのFWにも最小サンプルってこんな感じだよね
```ts
//route.ts
route.get(`/ping`, ()=>{return "pong"})
```

## Lv 2
**まずはrouteからWorkflowとMiddlewareが独立するよ！**
Laravel屋さん的にはControllerだし、FatControllerになるだろ！と悲鳴をあげる向きも多いと思うが、**Fat Workflowになったら設計ツールに叱られるから大丈夫さ！**

余談だが、最初ここActionにしていて、「バックエンド初心者的にも直感的でいいやろ～いきなりControllerはMVC理論優先で大仰すぎるしな～」とか思ってたんだけど、後で話す**高レベル帯でWorkflowの意味が変わってしまう**という問題が発生して、スケールした後も用語として維持できるWorkflowにした。

またここで**Middleware**も同時に導入するよ。Middlewareは「**このリクエストがアプリに到達していい権利があるか**」を判断するゲートだ。認証・認可・IP制限・レートリミットといった色んなルートに横断的にかかる処理がここに入る。
「早すぎるだろ！」という声もあるかもしれないけど、FWが公式提供するミドルウェアを使って初心者でも認証やIP制限ありの簡単なWebアプリケーションを作れるようにしたいという意図だよ。

```
route.ts → [Middleware群] → Workflow → [Response]
```

棲み分けの原則：
- **Middleware**：リクエストが「存在していい」かどうかの関心（認証・認可・レートリミット等）
- **Workflow**：ビジネスロジックの関心（Middlewareの仕事を持ち込まない）


### アーキテクチャルール
- routeに実処理を書かない
- Workflow内に認証・認可・レートリミット等の横断的処理を書かない（Middlewareへ）

> 💧 **Kaachan/Slime**: 上記ルールの自動検知・Slimeが提供するauth等の公式Middlewareについては[FW文書](https://qiita.com/u83unlimited/items/8b0e5b51749ccdfde393#lv-2-1)参照

### 概念コード
```ts
//route.ts
// webルートを将来追加する予定があるなら /api/ 名前空間を初日から確保する
route.group({ prefix: '/api' }, (r) => {
  r.post('/user', CreateUserWorkflow)                         // Middlewareなし
  r.post('/profile', auth(), UpdateProfileWorkflow)           // 認証Middleware
  r.get('/admin', auth({ role: 'admin' }), GetAdminWorkflow)
  r.post('/some', myCustomMiddleware, SomeWorkflow)           // カスタムMiddleware
})

// /health 等のインフラ用ルートは /api/ の外に置く
route.get('/health', HealthCheckWorkflow)
```

```ts
//middleware.ts（カスタムMiddlewareの置き場所）
export const myCustomMiddleware = (req, res, next) => {
  // 独自のロジック（IP制限・社内SSO連携等）
  next()
}
```

```ts
//CreateUserWorkflow.ts
const CreateUserWorkflow = ()=>{
  // バリデーションもビジネスロジックもレスポンス整形も全部ここに書く
  // 認証チェックはここに書かない！
}
```

## Lv 3
**WorkflowからParseが独立するよ！あとDBアクセス禁止な！**

はい、というわけで、Laravelユーザーからしたらちょっと驚くような変更点ですが、**事前の処理ではバリデーションはせず、パース（飛んできたリクエストの型付きオブジェクトへの変換）のみ行います！更にDBアクセスも禁止！**

というのもLaravelではValidate相当のFormRequestクラスでDBアクセスができちゃうため、良くも悪くもバリデーションとビジネスロジックとしてのチェックがどちらでも書けてしまい、バリデーションやドメインとしてのチェックが染み出しがちという問題がありました。また本質的にバリデーションとビジネスロジックとしてのチェックはシームレスな所があります。これを解決するには事前処理ではなく後でやるしかないという判断です。

ちなみにこの設計は「[Parse, don't Validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)」という言葉およびブログ記事として知られ、Haskellコミュニティで非常に影響があったそうです。その流れを受け、TS向けバリデーションライブラリのzodやvalibot等がこの思想をベースに実装しているとのこと（Claude談）


### アーキテクチャルール
- Workflow内でparse相当の処理を書かない
- Parseからのリソースアクセス（DB・外部API等）禁止

> 💧 **Kaachan/Slime**: 自動検知・`slime export:schema` / `slime export:openapi`の詳細は[FW文書](https://qiita.com/u83unlimited/items/8b0e5b51749ccdfde393#lv-3-1)参照

### 概念コード
```ts
// route.tsは省略

// parse.ts
type CreateUserInput = { name: string; email: string }

export const parseCreateUser = (input: unknown): CreateUserInput => {
  if (!input.name) throw new Error("name required")
  if (!input.email.includes("@")) throw new Error("invalid email")
  return { name: input.name, email: input.email }
}

// CreateUserWorkflow.ts
export const CreateUserWorkflow = (input: unknown) => {
  const valid = parseCreateUser(input)

  // ここからビジネスロジック（Lv5以降で整理していく）
  const user = saveUser(valid)
  return user
}
```

> 💡 **ADR**: [なぜWorkflowはHTTPに依存しない設計になっているか](https://qiita.com/u83unlimited/items/69a554c216d7b4bbc1b2#adr-lv3なぜworkflowはhttpに依存しない設計になっているか)

## Lv 4
**WorkflowからDB(=store)/外部API(=client)アクセス層が独立するよ**。いわゆるレイヤーとかってバックエンド初心者には分かりづらい側面があると思うけど、流石にDBや外部APIは直感的だし、分離はコスパがいいのでここで導入。
Laravelユーザーからするとようやくここかという感じだと思いますが、**設計ツールが叱りまくるのでControllerからのDBアクセス/外部APIアクセスが消えるだけでも大きいと思う**
あとついでに**このstoreにはスタイルガイドと1つの制約があります。** まずスタイルガイドとして関数名の命名規則を推奨する。

- 読み系（Query）: find*, list*, get*, count*, search* で始める
- 書き系（Command）: create*, save*, update*, delete*, remove* で始める

今は「なんとなく読み書きで名前の雰囲気が変わる」程度の意識でOK。**Lv6で正式にエラー化、Lv10のCQRSで読み書きを構造ごと分離するところまで、段階的に制約が強まっていく。**
次に唯一の制約として**ORMオブジェクトの外部流出禁止**。Store内でPrismaやdrizzleを使うのはOKだが、外に返す型は自前で定義した純粋なデータ型のみ。LaravelでEloquentのModelが染み出してController（このアーキテクチャではWorkflow）上から `.save()` や `.orders` が呼べてしまう問題をここで断ち切る。
複数のStoreをまたぐトランザクションが必要な場合は、WorkflowにORM固有のトランザクションAPIを直書きせず、トランザクションラッパー経由に統一するようにするよ（ORMへの依存がWorkflowに漏れるのを防ぐため）。

### アーキテクチャルール
- store.ts
  - DBアクセスを唯一許可（外部APIアクセスは client.ts が担当）
  - 関数名は命名規則に従う（推奨レベル。Lv6でエラー化、Lv10でCQRSフォルダとして完成）
  - ORM型（`Prisma.User`等）を戻り値の型として使用しない（純粋なデータ型のみ返却可能）
- workflow.ts
  - ORM固有のトランザクションAPIを直書きしない（トランザクションラッパー経由に統一）

> 💧 **Kaachan/Slime**: 自動検知・`withTransaction()`の実装については[FW文書](https://qiita.com/u83unlimited/items/8b0e5b51749ccdfde393#lv-4-1)参照

### 概念コード
```ts
//route.ts,parse.tsは省略

// 自前の純粋な型定義（ORMと無関係）
type User = { id: string; name: string; email: string }

//store.ts
export const findUserByEmail = async (email: string): Promise<User | null> => {
  const record = await prisma.user.findUnique({ where: { email } }) // ORMアクセスはここの中だけ
  if (!record) return null
  return { id: record.id, name: record.name, email: record.email } // 純粋な型で返す
}

export const saveUser = async (user: { name: string; email: string }): Promise<User> => {
  const record = await prisma.user.create({ data: user })
  return { id: record.id, name: record.name, email: record.email }
}

//client.ts
export const sendWelcomeMail = async (email: string) => {
  console.log("Calling external mail API:", email)
}

//Workflow.ts
export const CreateUserWorkflow = async (input: unknown) => {
  const valid = parseCreateUser(input)

  const exists = await findUserByEmail(valid.email)
  if (exists) {
    throw new Error("User already exists")
  }

  const user = await saveUser(valid)
  await sendWelcomeMail(user.email)

  return user
}

// 複数Storeをまたぐトランザクションが必要な場合
export const CreateUserWithAuditWorkflow = async (input: unknown) => {
  const valid = parseCreateUser(input)

  return withTransaction(async () => {  // ORM固有のトランザクションAPIは直書きしない
    const user = await saveUser(valid)        // 同じトランザクション内
    await saveAuditLog(user.id, "USER_CREATED") // 同じトランザクション内
    return user
  })
}
```

## Lv 5
いよいよここからLaravelの想定外の、ユーザーランドの経験則/集合知で何とかしている領域に入るよ。
まずはWorkflowからビジネスロジック(Logic)を分離するんだ。昨今の関数型プログラミングの影響を受けて、**Logicは、状態を持たず、副作用を持たない、純粋なビジネス判断だけを担う層**にするよ！保守性がよくなるからね！
あともう一つLogicについては制約をつけるよ。ロジックには 成功レール と 失敗レール の2本がある。ok()に乗せたら成功レール、err()に乗せたら失敗レール。Workflowはどっちのレールで返ってきたか確認してから次の処理を決める。**レールから落ちる（throw Error）のは禁止！** これが高レベル帯で効いてくる。
とまぁここまで来たら当然自動テストも書いてほしいよね、ってことで**Logicは自動テスト必須**。

> **設計理論との接続**：このLogic層は「**Decision Objectパターン**」と呼ばれる設計パターンと同じ概念です。Workflowに条件分岐が増えてきたとき、「ビジネス判断」だけを切り出して専用の関数に移す──それがDecision Objectパターンであり、Slime ArchitectureではLogicがその役割を担います。Result型（ok/err）を使うことで、判断の結果が型として明示され、Workflowは「判断する」のではなく「判断結果に従って動く」という役割分担が自然に生まれます。

### Fat Logic防止戦略

Logic層の最大リスクはドメイン分割（Lv6）前の際限ない肥大化。ここに関しては静的解析だけでは限界があるが、**4つのアプローチを組み合わせて包囲網を組む**：

1. ドメインprefixによる命名規則強制（`userCan*`等）
2. `logic/`フォルダへの中間昇格
3. 型依存グラフ解析（互いに型依存が交差しない関数群をドメイン候補として自動検出）
4. 設計リンターとAIのrulesファイルで役割分担してドメイン分割を誘導する（静的解析 vs AIの文脈理解）


### アーキテクチャルール
- Workflow
  - ビジネス判断（条件分岐）を直書きしない。Logic関数に切り出す
  - 一定規模を超えたらLv6への移行を検討する
- Logic
  - 純粋関数のみ（状態・副作用禁止）
  - throwはNG。Result型（ok/err）で返す（WorkflowはResultを受け取ってthrow可）
  - 自動テスト必須
  - **関数名にドメインprefixを必須**（`userCan*`・`orderCan*` 等）
  - 同一ファイルで異なるprefixが混在してきたら `logic/` フォルダへの分割を検討

> 💧 **Kaachan/Slime**: 肥大化の自動検知閾値・エスカレーション（Hint/Warning/Error）・Result型の提供については[FW文書](https://qiita.com/u83unlimited/items/8b0e5b51749ccdfde393#lv-5-1)参照
>
> 💡 **ADR**: [なぜ「Logicだけ」Result型なのか（ROPの射程）](https://qiita.com/u83unlimited/items/69a554c216d7b4bbc1b2#adr-lv5なぜlogicだけresult型なのかropの射程) / [ResultAsync（チェーン専用型）を採用しない理由](https://qiita.com/u83unlimited/items/69a554c216d7b4bbc1b2#adr-lv5resultasyncチェーン専用型を採用しない理由)


### 概念コード
```ts
// parse.ts,store.ts,client.tsは省略

// logic.ts（関数名はドメインprefix必須）
// Result型: ok(value)で成功、err(error)で失敗を表現（neverthrow等のResult型ライブラリ、またはFWが提供するok/errを使用）

// ✅ "user" prefixで統一
export const userCanCreate = (alreadyExists: boolean): Result<void, "USER_ALREADY_EXISTS"> =>
  alreadyExists ? err("USER_ALREADY_EXISTS") : ok(undefined)

// ⚠️ 異なるprefixが混在すると型依存グラフ解析と合わせて警告
// export const orderCanPlace = (stock: number): Result<void, "OUT_OF_STOCK"> => ...

// CreateUserWorkflow.ts
import { parseCreateUser } from "./parse"
import { userCanCreate } from "./logic"  // prefix付き関数名
import { findUserByEmail, saveUser } from "./store"
import { sendWelcomeMail } from "./client"

export const CreateUserWorkflow = async (input: unknown) => {
  // 入力境界
  const valid = parseCreateUser(input)

  // 状態取得（副作用）
  const exists = await findUserByEmail(valid.email)

  // 純粋ビジネス判断（Resultで返ってくる）
  const result = userCanCreate(!!exists)
  if (!result.ok) throw new Error(result.error)  // WorkflowはResultを受け取ってthrow可

  // 永続化（副作用）
  const user = await saveUser(valid)

  // 外部通信（副作用）
  await sendWelcomeMail(user.email)

  return user
}
```

### Lv5時点のディレクトリ構造
```
/src
  route.ts           # Lv1から
  workflow.ts        # Lv2で追加
  middleware.ts      # Lv2で追加
  parse.ts           # Lv3で追加
  store.ts           # Lv4で追加
  client.ts          # Lv4で追加
  logic.ts           # Lv5で追加（prefix命名必須。閾値超過でlogic/へ昇格を促される）
  # ↓ 閾値超過後の中間昇格先（Lv6前の整理。ドメイン分割の雛形になる）
  logic/
    user.ts          # userCan*系の関数
    order.ts         # orderCan*系の関数
```

---

## 🔄 ここから「層の時代」→「構造の時代」へ

**Lv1-5 は「何をどの層（ファイル）に置くか」を学ぶ時代だった。**
route → Parse → Workflow → Store/Client → Logic という処理の流れに沿って、ファイル種別が1つずつ増えるシンプルなパターン。問いは常に「この処理はどのファイルに書くか？」だった。

**Lv6 からは問いの種類が変わる。**
「どのファイルに書くか」ではなく「そのファイルをどう組織化するか」。ドメインモデリングの比重が増し、FWが提供できるのは制約による支援のみで、正解はコードの外側（ビジネスの知識）にある。

**もう一つ、Lv6以降で起きる大きな変化がある。「全WorkflowはRouteから呼ばれる」という前提が崩れる。**
Lv1-5ではHTTPリクエスト → route.ts → Workflowという1本道だったが、Lv6でドメインが分割されると、ドメインWorkflowはroute.tsではなくapp/workflow.tsから呼ばれる「内部関数」になる。Lv8のドメインイベント以降はさらにその先があって、**キュー（バックグラウンドジョブ）・cronスケジューラ・CLIコマンド**といったHTTP以外の起動口も出てくる。route.tsは「アプリへの入口の一種」に過ぎず、ドメインWorkflowはHTTPを一切知らなくていい。これが高レベル帯の前提になる。

**Lv5でhintが出始めたら、Lv6移行前にフォルダを自主的に切り始めてもよい（制約なし）。**
ただし「どのドメインで切るか」は静的解析では判断できない。関数名・ファイル名の傾向から機械的に推測することは原理的には可能だが、命名が雑な場合には解析が崩壊するため信頼性が担保できない。AIや人間との相談を前提とし、準備ができたらLv6に移行する。

---

## Lv 6
このフェーズで起きることと言えば、

- ドメインモデリングの本格化
- ビジネスロジックの肥大化（Fat Service問題）
- 高度な（≒クロスドメインな）ビジネスロジックの整理問題

が浮かんだので、これを主に**制約の追加によって解決する。**

具体的には初期から存在しているAppを「指示専門**になりたい**層」として再定義。肥大化およびビジネスロジックの存在にアラートを出す。
このアラートは

- ドメインを切ってそっちのlogic.tsに入れる
- Sharedフォルダを新設してそっちに入れる

ように促す。Sharedは「共有ロジック/ドメイン切るほどでもない小ロジックと未分化DBアクセス」の一時置き場。`utility.ts` / `smallLogic.ts` は純粋関数のみ。`store.ts` はDBアクセスを許容するが、どちらも肥大化にはアラートが出る。
domain間の相互参照は禁止で、App層だけが複数ドメインへのアクセスが可能になる。

またここからstore（DBアクセス層）、client（外部APIアクセス層）の扱いを若干変え、
**storeはドメインへの切り出しを促し、client.tsはclientフォルダを切ってそちらに一旦移動するように促す。**

この違いはDBはこちらで設計/変更可能だが、外部APIはこちらで変更不可能であり、腐敗防止や調整をする層（adapter.ts）が必要になるため。
扱いがえらく大仰に見えるかもしれませんが、相手先のAPIが「こちらのアプリと同じ用語を使ってるけど意味合いが若干違う」等のケースで、
直接こちらのドメイン内に紐づけて**相手先のAPIの設計にこちらの設計やロジックが引っ張られたり、染み出してくるのを避けたい** んですよね。

### アーキテクチャルール
- App
  - ビジネスロジックを持たない（指示専門層を目指す）
  - 肥大化を避ける
  - 各ドメインへのアクセスはApp層のみ可能
  - app/store.ts は置かない
  - app/client.ts は置かない（client/フォルダへ移動）
  - **app/route.ts はエントリーポイントのみ**（`app/routes/api.ts` と `app/routes/web.ts` をimportして束ねる）
  - **app/routes/api.ts** が `/api/` グループでdomainルートを束ねる。**app/routes/web.ts** は将来のwebルート置き場（今は空でよい）
  - ルート定義・ミドルウェア・URLパターンは domain/*/routes.ts に移動する
- Shared
  - 各domainから参照可
  - `utility.ts` / `smallLogic.ts` は純粋関数のみ（副作用禁止）
  - `store.ts` はDBアクセス許容（ドメイン未分化の一時置き場）
  - 肥大化を避ける
  - domainフォルダのファイルをimportしない（それはcross-domainの仕事）
- client
  - client.ts は adapter.ts 経由でのみ呼び出す（直呼び出し禁止）
- store
  - 関数名が命名規則に従っていない場合はエラー
  - query系関数内にcommandが混在したらエラー（逆も同様）
- domain
  - **routes.ts にドメイン固有のルート定義・ミドルウェア付与を書く**
- domain間の相互参照禁止

> 💧 **Kaachan/Slime**: 自動検知の詳細は[FW文書](https://qiita.com/u83unlimited/items/8b0e5b51749ccdfde393#lv-6-1)参照

### ディレクトリ図

```
/src
 ├─ app/                  # アプリ全体の指示役（になりたい）層
 │    ├─ route.ts         # エントリーポイント（routes/ をimportして束ねる）
 │    ├─ routes/
 │    │    ├─ api.ts      # /api/* 空間（domainルートを束ねてprefixを付与）
 │    │    └─ web.ts      # /* 空間（将来のwebルート置き場。今は空でよい）
 │    ├─ parse.ts         # パース（型変換）
 │    ├─ middleware.ts    # Middlewareの置き場所（Lv2から継続）
 │    └─ workflow.ts      # クロスドメインOrchestration (App層)
 │
 ├─ shared/               # 共通・未分化ロジックの溜まり場
 │    ├─ utility.ts       # 純粋関数・ユーティリティ
 │    ├─ smallLogic.ts    # ドメイン切るほどでもない小ロジック
 │    └─ store.ts         # ドメイン切るほどでもないDBアクセス層
 │
 ├─ client/               # 外部アクセス層
 │    ├─ client.ts        # 外部データアクセスロジック
 │    └─ adapter.ts       # 調節用ロジック/腐敗防止層/こちらのドメインとのマッピングロジック
 │
 ├─ domainA/              # ドメインAの専用Logic
 │    ├─ routes.ts        # ← Lv6で追加（URLパターン・ミドルウェア・Workflowの対応）
 │    ├─ workflow.ts      # ドメインAのWorkflow
 │    ├─ logic.ts         # ドメインAのビジネスロジック
 │    └─ store.ts         # ドメインAのDBアクセス層
 │
 ├─ domainB/              # ドメインBの専用Logic
 │    ├─ routes.ts
 │    ├─ workflow.ts
 │    └─ logic.ts
 │
 └─ domainC/...           # 追加ドメインは同様
```


## Lv 7
Lv7は正直Lv6の延長戦だと思っていて、メインの課題は **「ビジネスロジック≒ドメインの肥大化をどう整理すべきか」** になる。

- **各logic.tsに対してテストがない場合、エラー扱い**にします。
- 複数ドメインアクセスが唯一可能なAppを肥大化することが想定されるので、`cross-`というprefixを付けたフォルダを作成すると、そこもそこから複数ドメインアクセス可能にする
  - `cross-`フォルダからAppの参照は禁止。
- ドメインも入れ子になると想定し、上位→下位しか参照できないという制約を追加。
- **post-commitフック**を導入。トランザクション内で `defer()` を呼ぶと**コミット成功後**に実行されるhookとして動作し、トランザクションのロック時間を最小化する。トランザクション外で呼ぶと**メイン処理完了後**に in-process で即実行するpost-operationフックとして動作する（単一テーブルへの書き込み等、トランザクション不要なケースでの軽量副作用に使う）。重い処理は Queue（別プロセス）に任せる。

### アーキテクチャルール
- App
  - 肥大化しない
  - logic.ts, store.ts, client.ts を持たない
- Shared
  - 肥大化しない
- domain
  - 上位から下位ドメインの参照のみ可。下位ドメイン同士の参照禁止
- cross-domain
  - 複数ドメイン参照可。App参照禁止
- Logic
  - 対応するlogic.test.tsが存在しない場合はエラー
- Workflow（トランザクション内）
  - 非DB非同期処理（メール送信・外部API呼び出し等）はpost-commitフックで外出しすることを検討する

> 💧 **Kaachan/Slime**: `defer()` の提供・自動検知の詳細は[FW文書](https://qiita.com/u83unlimited/items/8b0e5b51749ccdfde393#lv-7-1)参照

### 概念コード
```ts
// defer() 使用例：コミット後に実行したい処理をトランザクション外に追い出す
export const CreateUserWorkflow = async (input: unknown) => {
  const valid = parseCreateUser(input)

  return withTransaction(async () => {
    const user = await saveUser(valid)

    defer(async () => {
      await sendWelcomeMail(user.email)  // コミット後に実行（ロック時間に含まれない）
    })

    return user
  })
}
```

### ディレクトリ図

```
/src
 ├─ app/
 │    ├─ route.ts
 │    ├─ routes/
 │    │    ├─ api.ts        # /api/* 空間
 │    │    └─ web.ts        # /* 空間（将来用）
 │    ├─ parse.ts
 │    ├─ middleware.ts
 │    └─ workflow.ts
 │
 ├─ shared/
 │    ├─ utility.ts
 │    ├─ smallLogic.ts
 │    └─ store.ts
 │
 ├─ client/
 │    ├─ client.ts
 │    └─ adapter.ts
 │
 ├─ domainUser/
 │    ├─ routes.ts          # userドメインのルート定義（prefixなし。api.tsで付与）
 │    ├─ workflow.ts
 │    ├─ logic.ts
 │    ├─ logic.test.ts      ← Lv7でテスト必須（ないとエラー）
 │    └─ store.ts           # Lv4から継続（query*/command*命名規則はLv6でエラー化済み）
 │
 ├─ domainOrder/
 │    ├─ routes.ts
 │    └─ ...（同様の構造）
 │
 └─ cross-userOrder/        ← Lv7で追加（複数ドメイン参照可。App参照禁止）
      └─ workflow.ts
```

## Lv 8
Lv8では**ドメインイベントを使ってcross-フォルダの特化と副作用の整理**をするよ！

Lv7の`cross-`フォルダは「複数ドメインを直接参照できる場所」として機能してきたけれども、肥大化するにつれて「第二のApp層」になる問題があるんだ。Lv8ではこれを解決するために**ドメインイベント**を導入する。LaravelにもEventがあるけど、あれを使って複数ドメインをまたぐ処理の一部を整理する。
具体的なユースケースとしては、**「ユーザー登録後のウェルカムメール送信」「注文確定後のポイント付与」「記事投稿後のフォロワー通知」** といったケースだ。共通しているのは「**本体の処理が成功した後に発生する副作用であり、失敗してもロールバックは不要**」という点。ウェルカムメールが送れなくてもユーザーは登録できているし、ポイント付与が遅延してもそれは別途リカバリできる。
逆に「注文作成と在庫減算を必ず同時に成功・失敗させたい」というような絶対にDB上の整合性を取らないといけない処理（＝トランザクション貼るような処理）には適用できない。

よって、

- **副作用（トランザクション後・失敗許容）** → ドメインイベント経由
- **原子性が必要な複数ドメイン操作** → `cross-`フォルダ継続（トランザクション専用に特化）

という分け方になる。

### ドメインイベントの実装方針

- イベントは**純粋なデータ型**として `shared/events.ts` に集中定義（どのドメインにも属さない公開契約）
- ドメインWorkflowは重要なビジネスファクトを**イベント型として返す**
- App層がイベントを受け取り、後続のドメインWorkflowに明示的に渡す
- 非同期副作用は引き続き `defer()` と組み合わせる

### アーキテクチャルール
- shared/events.ts
  - Eventはオブジェクト型のみ（クラスインスタンス禁止）
  - `type` フィールド（discriminated union）必須
- cross-フォルダ
  - `withTransaction()` を伴わない処理のみで構成されている場合は警告（「これはイベントで書けるはず」）
  - メール送信・外部API呼び出し等の非トランザクション処理を含まない

> 💧 **Kaachan/Slime**: 自動検知の詳細は[FW文書](https://qiita.com/u83unlimited/items/8b0e5b51749ccdfde393#lv-8-1)参照

### 概念コード
```ts
// shared/events.ts（イベント定義は純粋なデータ型。全ドメインの公開契約）
type UserCreatedEvent = {
  type: "USER_CREATED"
  payload: { userId: string; email: string }
}

type OrderPlacedEvent = {
  type: "ORDER_PLACED"
  payload: { orderId: string; userId: string; items: OrderItem[] }
}

// domainUser/workflow.ts（ドメインはnotificationの存在を知らない）
export const createUserWorkflow = async (input: ValidatedInput): Promise<UserCreatedEvent> => {
  const user = await saveUser(input)
  return { type: "USER_CREATED", payload: { userId: user.id, email: user.email } }
}

// app/workflow.ts（App層がイベントを受け取って後続に渡す）
export const CreateUserWorkflow = async (input: unknown) => {
  const valid = parseCreateUser(input)
  const event = await createUserWorkflow(valid)

  await notificationWorkflow(event)             // 同期・重要な後続処理
  defer(() => analyticsWorkflow(event))         // 非同期・失敗許容な副作用

  return event.payload
}

// cross-/orderInventory/workflow.ts（原子性が必要な処理はcross-が担当）
export const createOrderWithInventory = (input: unknown) =>
  withTransaction(async () => {
    const event = await orderDomain.createOrder(input)
    await inventoryDomain.deductStock(event.payload.items)  // 失敗したらロールバック
    return event
  })
```

### ディレクトリ図
```
/src
 ├─ app/
 │    ├─ route.ts
 │    ├─ routes/
 │    │    ├─ api.ts        # /api/* 空間
 │    │    └─ web.ts        # /* 空間（将来用）
 │    ├─ parse.ts
 │    ├─ middleware.ts
 │    └─ workflow.ts
 │
 ├─ shared/
 │    ├─ utility.ts
 │    ├─ smallLogic.ts
 │    ├─ store.ts
 │    └─ events.ts          ← Lv8で追加（全ドメインイベントの定義置き場）
 │
 ├─ client/
 │
 ├─ domainUser/
 │    ├─ routes.ts          # userドメインのルート定義
 │    ├─ workflow.ts
 │    ├─ logic.ts
 │    ├─ logic.test.ts
 │    └─ store.ts            # ORMの実装 + 関数仕様が混在（query*/command*命名規則あり）
 │
 ├─ domainOrder/
 │    ├─ routes.ts
 │    └─ ...（同様の構造）
 │
 └─ cross-*/                ← トランザクション専用に特化（非トランザクション処理は警告）
```

> 💡 **ADR**: [なぜイベントバス（emit/on）ではなく戻り値方式を選んだか](https://qiita.com/u83unlimited/items/69a554c216d7b4bbc1b2#adr-lv8なぜイベントバスemitonではなく戻り値方式を選んだか)



## Lv 9

Lv8でドメインイベントによる副作用の整理ができた。でも実はまだ問題が残っている。**ドメインのWorkflowがDBの実装を直接importしている**んだ。

```ts
// Lv8時点の domainUser/workflow.ts
import { findUserByEmail, saveUser } from "./store"  // ← 中を追うとORMの実装が出てくる

export const createUserWorkflow = async (input: ValidatedInput) => {
  const exists = await findUserByEmail(input.email)
  ...
}
```

`findUserByEmail` を追いかければORMのDBアクセスコードが出てくる。つまり `store.ts` は「ORMを使ってDBにアクセスする実装」と「ドメインが必要とする関数の仕様（こういう関数が欲しいという宣言）」が1ファイルに混在していて、ドメインは間接的にDBを知っている状態だ。これの何が問題かというと：


- **テスト**：Workflowのテストに本物のDBが必要になる（もしくはORMをモックする必要がある）
- **ORM切り替え**：PrismaをDrizzleに変えたい場合、domainフォルダのコードを変更しなければならない

Lv9では **Port** を導入してこれを解決するよ。

---

### Portとは何か

**Port＝ドメインが「こういう関数を持ってきてくれ」と宣言する型定義だ。**

```ts
// domainUser/ports.ts
type UserPort = {
  findByEmail: (email: string) => Promise<User | null>
  save: (user: NewUser) => Promise<User>
}
```

これはただの型。ORMも何も使っていない。「ユーザードメインはこういう関数が必要だ」という宣言だけが書かれている。

`store.ts` は「ORMを使ってDBにアクセスする実装」と「ドメインが必要とする関数の仕様」が1ファイルに混在していた。Lv9ではこれを2つに分離する：

- **仕様（Port）** → `domainUser/ports.ts` に残る（ORMを知らない）
- **実装（Adapter）** → `infrastructure/user/prismaAdapter.ts` に移動する

なお、元の`shared/store.ts` はこのタイミングで `infrastructure/` に発展消滅する。以降、**storeという語はコードベースから消える。**

---

### ディレクトリ図

```
Lv9前:
  domainUser/
    store.ts         （ORMの実装 + 関数仕様が混在。query*/command*命名規則あり）

Lv9以降:
  domainUser/
    ports.ts              （関数仕様だけ。ORMを知らない）
  infrastructure/
    user/
      prismaAdapter.ts    （ORMの実装だけ）
```

**domainフォルダからORMへの直接依存が消える。**

---

### WorkflowはPortを「引数」で受け取る

WorkflowはPortを引数で受け取るように変わる：

```ts
// domainUser/workflow.ts
export const createUserWorkflow =
  (port: UserPort) =>            // ← Portを引数で受け取る
  async (input: ValidatedInput): Promise<UserCreatedEvent> => {
    const exists = await port.findByEmail(input.email)
    canCreateUser(!!exists)
    const user = await port.save(input)
    return { type: "USER_CREATED", payload: user }
  }
```

`infrastructure/` フォルダに実際のORM実装を使ったAdapterを置く：

```ts
// infrastructure/user/prismaAdapter.ts
export const prismaUserPort: UserPort = {
  findByEmail: (email) => prisma.user.findUnique({ where: { email } }),
  save: (user) => prisma.user.create({ data: user }),
}
```

App層でPortとWorkflowを繋げる：

```ts
// app/workflow.ts
import { createUserWorkflow } from "../domainUser/workflow"
import { prismaUserPort } from "../infrastructure/user/prismaAdapter"

export const CreateUserWorkflow = createUserWorkflow(prismaUserPort)
```

---

### これで何が嬉しいのか

**テストが劇的に楽になる：**

```ts
// テスト用のインメモリAdapter（DB不要）
const testUserPort: UserPort = {
  findByEmail: async (email) => stored.find(u => u.email === email) ?? null,
  save: async (user) => { stored.push(user); return user },
}

// DBなしでWorkflowをテストできる
const workflow = createUserWorkflow(testUserPort)
const result = await workflow({ name: 'foo', email: 'foo@example.com' })
```

**DB/ORM切り替えが簡単になる：**

ORMをDrizzleや別のものに変えたいなら `infrastructure/user/drizzleAdapter.ts` を作って差し替えるだけ。domainフォルダのコードは1行も変わらない。

> **設計理論との接続**：このPort & Adapters構造はそのまま**ヘキサゴナルアーキテクチャ**（Alistair Cockburn, 2005）の関数型実装だ。OOP版ではinterfaceを使ってDIコンテナで注入するが、関数型版ではPortを関数シグネチャの型として定義し、Workflowの引数として渡す。結果として達成されることは同じで「ドメインがインフラを知らない」状態だが、DIコンテナもclassも必要ない。

---

### アーキテクチャルール
- domainフォルダ内にORM等のDBアクセスライブラリのimportを持ち込まない
- WorkflowはPortを引数で受け取る形式にする
- infrastructureフォルダ外でORMを直接操作しない

> 💧 **Kaachan/Slime**: 自動検知の詳細は[FW文書](https://qiita.com/u83unlimited/items/8b0e5b51749ccdfde393#lv-9-1)参照
>
> 💡 **ADR**: [storeという名前の来歴と分離](https://qiita.com/u83unlimited/items/69a554c216d7b4bbc1b2#adr-lv9storeという名前の来歴と分離) / [なぜPorts & AdaptersにDIコンテナを使わないか](https://qiita.com/u83unlimited/items/69a554c216d7b4bbc1b2#adr-lv9なぜports--adaptersにdiコンテナを使わないか)

### ディレクトリ図

```
/src
 ├─ app/
 │    ├─ route.ts
 │    ├─ routes/
 │    │    ├─ api.ts         # /api/* 空間
 │    │    └─ web.ts         # /* 空間（将来用）
 │    ├─ parse.ts
 │    ├─ middleware.ts
 │    └─ workflow.ts         ← PortとWorkflowをここで繋げる
 │
 ├─ shared/
 ├─ client/
 │
 ├─ domainUser/
 │    ├─ routes.ts           # userドメインのルート定義
 │    ├─ ports.ts            ← Lv9で追加（仕様だけ・ORM不在）
 │    ├─ workflow.ts         ← Portを引数で受け取るように変更
 │    ├─ logic.ts
 │    └─ （store.tsの実装部分が infrastructure/ へ移動し、仕様部分が ports.ts に）
 │
 ├─ cross-*/
 │
 └─ infrastructure/          ← Lv9で追加（実装だけ）
      ├─ user/
      │    └─ prismaAdapter.ts
      └─ mail/
           └─ sendgridAdapter.ts
```

### storeとPorts & Adaptersについて

`store.ts` はDB操作を1箇所に集める実用的な層として、Lv4からLv8まで機能してきた。「ORMを使ってDBにアクセスする実装」と「ドメインが必要とする関数の仕様」が1ファイルに混在する形だったが、これまでは機能してきた。だがやがて限界が来る。

Lv9でこの混在が解消されるとき、storeは仕様（`ports.ts`）と実装（`infrastructure/`）に分離し、`store` という語はコードベースから消える。これはstoreが不完全なまま終わったのではなく、**Ports & Adapters（ヘキサゴナルアーキテクチャ）として正式化された**結果だ。DBアクセスを1箇所に集めるという役割は完成し、次の段階として「仕様と実装を分離する」という構造に発展した。

---

> **CA/DDDを知っている読者へ**：`store.ts` はDDDのRepository Patternが担う役割と同等のもの──「ドメインが必要とするデータ操作を外部実装から切り離す層」──を果たしています。ただし、Repository PatternはOOP文脈ではinterfaceと実装の分離で実現しますが、Lv4-8の `store.ts` はその分離が済んでいない「実装を含む混在層」です。Lv9でPorts & Adapters（ヘキサゴナルアーキテクチャ）として正式化されるとき、`store.ts` は「Repositoryが本来やろうとしていたこと」の関数型実装として完成します。Repository ⊂ Ports & Adapters という包含関係を踏まえれば、`store.ts` はRepositoryパターンの練習台ではなく、より大きな概念の入口として機能していたと解釈してください。


## 🔄 Lv9→10 に入る前に ── Ports & Adapters と CQRS の役割分担

Lv9とLv10は、**それぞれ異なる軸の問題を解決するパターン**を導入する。どちらか一方を単独で経験したことがある人は多いと思うが、同じアーキテクチャの中で両方を組み合わせると混乱しやすいので、先に整理しておく。

### Ports & Adapters（Lv9）が解決した問題：「ドメインがインフラを知っている」

```
Before: workflow.ts → store.ts（中にORMの実装がある）→ DB
After:  workflow.ts → ports.ts（型定義だけ）← infrastructure/prismaAdapter.ts（ORMの実装）
```

ドメインのコードからORMへの依存を切り離した。**テストにDBが不要になり、ORMの差し替えも容易になった。**

### CQRS（Lv10）が解決する問題：「読み取りと書き込みの最適な構造が違う」

```
Before: ports.ts（読み書き両方の仕様が1ファイルに混在）
After:  command/ports.ts（書き込み専用。集約境界を厳守）
        query/ports.ts（読み取り専用。越境JOINも許容）
```

ports.tsはORMを知らない純粋な型定義だが、「書き込みは集約境界を守れ、読み取りは越境JOINもOK」という**非対称なルールを1ファイルには表現できない**。それをフォルダ構造として分離するのがLv10の目的。

### 2つのパターンの関係

> **Ports & Adapters ＝「仕様と実装を縦に切る」**
> **CQRS ＝「読み書きを横に切る」**

この2つの「切り方」は直交しているため、役割が重複しない。**Ports & AdaptersでドメインをORMから独立させた後、CQRSで読み書きのモデルを分ける**という順序が自然だ。逆にやると、実装と仕様が混在したまま読み書きを分割することになり、複雑さが倍になる。

---

## Lv 10

Lv9でドメインがインフラを知らない状態を達成した。Lv10ではもう一つの大きな課題を解決する。**読み取りと書き込みの「最適な構造が違う」問題だ。**

書き込み（ユーザー登録・注文作成など）は**整合性が最優先**で、ドメインのルールを厳守しながらやる必要がある。一方で読み取り（ユーザー一覧・注文履歴など）は**速さと柔軟性が最優先**で、「usersとordersをJOINして一気に取ってきたい」というニーズが頻繁に発生する。

Lv9でports.tsとして仕様を取り出したが、このPortはまだ読み取りも書き込みも1つのファイルにまとまっている。実際のユースケースでは「ユーザー一覧ページを返すためにusers・orders・productsを一気にJOINしたい」のように**ドメイン境界を越えた読み取り**が必要になる。しかしports.tsが読み書き両方の仕様を持つ限り、「書き込みは集約境界を厳守、読み取りは越境JOINもOK」という**非対称なルールを構造として表現できない**。

Lv10ではこの問題を **CQRS（Command Query Responsibility Segregation）の正式導入**で解決するよ。

---

### CQRSとは何か

「書き込みのモデルと読み取りのモデルを分ける」という考え方だ。

- **Command（書き込み）**：ドメインの集約境界を厳守。整合性最優先
- **Query（読み取り）**：ドメイン境界を無視してJOINしてOK。速さ最優先

```
書き込み: domainUser → command/ → 集約ルートを通じた更新のみ
読み取り: query/ → users JOIN orders JOIN products でも何でもOK
```

---

### ディレクトリ構造の変化

Lv9まではdomain内が `ports.ts / workflow.ts / logic.ts` だったが、Lv10でcommand/とquery/に分裂する：

```
domainUser/
  command/                 ← 書き込み系（集約境界を厳守）
    ports.ts               # WritePort（書き込み専用）
    workflow.ts            # 書き込みWorkflow
    logic.ts               # 書き込みLogic（純粋関数）
  query/                   ← 読み取り系（越境JOINも許容）
    ports.ts               # ReadPort
    userList.ts            # 1クエリ1ファイル原則
    userDetail.ts
    userWithOrders.ts      # ← orders domainを越境してもOK
```

**query側はファイルを「1クエリ1ファイル」にする。** これが重要で、「このファイルが何を取得するか」が一目でわかる構造になる。共通化・汎用化は禁止。

### ディレクトリ図

```
/src
 ├─ app/
 │    ├─ route.ts
 │    ├─ routes/
 │    │    ├─ api.ts         # /api/* 空間
 │    │    └─ web.ts         # /* 空間（将来用）
 │    ├─ parse.ts
 │    ├─ middleware.ts
 │    └─ workflow.ts
 │
 ├─ shared/
 │    ├─ utility.ts
 │    ├─ smallLogic.ts
 │    └─ events.ts
 │
 ├─ client/
 │    ├─ client.ts
 │    └─ adapter.ts
 │
 ├─ domainUser/
 │    ├─ routes.ts          # userドメインのルート定義
 │    ├─ command/           ← 書き込み系（集約境界を厳守）
 │    │    ├─ ports.ts      # WritePort（書き込み専用の仕様）
 │    │    ├─ workflow.ts   # 書き込みWorkflow
 │    │    └─ logic.ts      # 書き込みLogic（純粋関数）
 │    └─ query/             ← 読み取り系（越境JOINも許容）
 │         ├─ ports.ts      # ReadPort
 │         ├─ userList.ts          # 1クエリ1ファイル原則
 │         ├─ userDetail.ts
 │         └─ userWithOrders.ts    # ordersドメインを越境してもOK
 │
 ├─ domainOrder/
 │    ├─ routes.ts
 │    ├─ command/
 │    └─ query/
 │
 ├─ cross-*/
 │
 └─ infrastructure/
      ├─ user/
      │    ├─ prismaWriteAdapter.ts    # command/ 向け
      │    └─ prismaReadAdapter.ts     # query/ 向け（JOIN実装を含む）
      └─ mail/
           └─ sendgridAdapter.ts
```

---

### 実際のコードイメージ

```ts
// domainUser/query/userWithOrders.ts
// ← ordersドメインを越境するクエリ。Lv9まではNGだったがquery/内はOK
type UserWithOrdersView = {
  userId: string
  name: string
  orders: { orderId: string; total: number }[]
}

// ReadPortの定義（query側）
type UserWithOrdersPort = {
  findWithOrders: (userId: string) => Promise<UserWithOrdersView | null>
}
```

```ts
// infrastructure/user/prismaReadAdapter.ts
// JOINを使った実装（query側なので越境OK）
export const prismaUserWithOrdersPort: UserWithOrdersPort = {
  findWithOrders: (userId) =>
    prisma.user.findUnique({
      where: { id: userId },
      include: { orders: true },  // ordersを越境してJOIN
    }),
}
```

書き込み側は変わらず集約ルートを通じた更新のみ：

```ts
// domainUser/command/workflow.ts
// command側はuser集約の外には直接触れない
export const createUserWorkflow =
  (port: UserWritePort) =>
  async (input: ValidatedInput): Promise<UserCreatedEvent> => {
    const exists = await port.findByEmail(input.email)
    canCreateUser(!!exists)
    const user = await port.save(input)
    return { type: "USER_CREATED", payload: user }
  }
```

---

### Lv4からの伏線回収

Lv4でQuery/Command命名規則（関数名）を入れた。Lv9でPorts & Adaptersとして仕様を切り出し、読み書きの関数がports.tsに名前として揃った。Lv10でそれをCQRSフォルダとして完成させる。**「命名で意識させ（Lv4）→インフラを切り離して仕様を明文化（Lv9）→読み書きを構造で分離（Lv10）」という3ステップが完成する。**

> **設計理論との接続**：このCQRSはGreg Youngが2010年前後に提唱した設計パターンが元祖。元々はイベントソーシングと組み合わせた重厚なアーキテクチャとして語られることが多いが、Slime ArchitectureではLv9までで積み上げたPort & Adapters構造の上に「読み書きのモデルを分ける」という部分だけを取り入れた軽量な形で採用する。なおCQRSが有効に機能するのは高負荷なシステムに限らず、「読み取りが複雑でドメイン境界を越えがち」なシステム全般に適用できるという示唆をmpywさんから頂いている。

---

### アーキテクチャルール
- command/内でReadPortを使用しない
- query/は1ファイル1クエリ（肥大化・共通化禁止）
- command/のWorkflowは集約ルートを通じた更新のみ
- query/へ集約クラス・ドメインオブジェクトを持ち込まない

> 💧 **Kaachan/Slime**: 自動検知の詳細は[FW文書](https://qiita.com/u83unlimited/items/8b0e5b51749ccdfde393#lv-10)参照
>
> 💡 **ADR**: [なぜCQRSはLv10なのか（Lv6でよいのでは）](https://qiita.com/u83unlimited/items/69a554c216d7b4bbc1b2#adr-lv10なぜcqrsはlv10なのかlv6でよいのでは)



## 🔌 プロトコル対応方針（GraphQL / gRPC / tRPC）

**共通原則：Slime本体のWorkflow/Logic/Parse構造には影響させない。プロトコルの差異はアダプター層が吸収する。**

| プロトコル | 対応方針 | アーキテクチャへの影響 |
|---|---|---|
| REST（デフォルト） | 組み込み | ― |
| GraphQL | 前段ゲートウェイ方式（Apollo Gateway等） | なし（ゲートウェイ側が吸収） |
| gRPC | client.ts層のトランスポートが変わるだけ | なし（Lv8以降） |
| tRPC | WorkflowをprocedureとしてラップするAdapter | なし（モノレポ選択時のみ） |

詳細は→ [設計根拠・補足資料 - プロトコル対応方針](https://qiita.com/u83unlimited/items/69a554c216d7b4bbc1b2#-%E3%83%97%E3%83%AD%E3%83%88%E3%82%B3%E3%83%AB%E5%AF%BE%E5%BF%9C%E6%96%B9%E9%87%9Dgraphql--grpc--trpc)

---

## 📦 残課題

### フロントエンドの扱い

**方針決定済み：APIサーバーに徹し、フロントエンドは疎結合に消費する**

アーキテクチャ視点では、Parse（入力境界）と対称な**Response（出力境界）**をRoute層で担う。JSON / ファイルdownload stream / 静的HTML / SSE / WebSocketはすべてWorkflowが純粋なデータを返す点は変わらず、Route定義でResponse形式を切り替えるだけで並列対応できる：

```ts
route.get('/users',         json(GetUsersWorkflow))       // JSON（REST API）
route.get('/report/export', stream(ExportReportWorkflow)) // ファイルダウンロード
route.get('/og/:id',        html(OgImageWorkflow))        // 静的HTML
route.get('/feed',          sse(NotificationWorkflow))    // Server-Sent Events
route.ws('/chat',           ws(ChatWorkflow))             // WebSocket
```

**Workflow/Logic/Store/Portの層は一切変わらない。変わるのはRoute定義のResponse形式だけ。** これはParse層が「HTTPから来たかバッチから来たかをWorkflowに知らせない」のと対称的な設計だ。

### バッチ処理・非同期処理の起動口

Laravelではcron（スケジューラ）やキューワーカーをFW内で完結させるのが自然だが、世間的にはLambda等のサーバーレス関数に切り出すのが主流になりつつある。

ただしこれは「起動口をどこに置くか」の問題であり、「ドメインロジックをどこに書くか」の問題ではない。Workflow/Logic/StoreはLambdaのhandlerから呼んでも動くように設計されているため、**起動口の選択はアーキテクチャの本体とは切り離せる**。FW組み込みのcron/CLIと外部サーバーレスアダプターはどのレベルでも並列で選択可能とする。

```ts
// Lv1-5（Port不要なWorkflowをそのまま渡す）
export const handler = createLambdaHandler({ trigger: "scheduled", workflow: SendDailyReportWorkflow })

// Lv9+（Port injection済みの関数を渡すだけ。アダプターの使い方は変わらない）
export const handler = createLambdaHandler({ trigger: "sqs", workflow: processOrderWorkflow(prismaPort) })
```

### Fat Parse問題

`parse.ts`もFat Logicと同じ肥大化リスクを持つ。Lv6以降でドメインが増えると各ドメインのparseが1ファイルに混在する。`logic/`中間昇格と同パターンで対処（`parse/createUser.ts`等）。共通化は許容し肥大化のみ検知する。

### Fat Routing問題

`app/route.ts` もFat Logicと同じ肥大化リスクを持つ。解決方針はLv6で確定済み（domain co-location）だが、以下の点が残課題。

- **バージョン廃止管理**：`/v1/` が無計画に残存する「バージョン増殖」問題。廃止予告（`Deprecation`・`Sunset` ヘッダー）をルート定義の属性として指定し、`sunset` 日付超過ルートをKaachanが警告検知する仕組みが必要
- **死んだルート検知**：ルート定義は残っているがWorkflowファイルが存在しない「孤立ルート」と、Workflowファイルは存在するがどのルートからも参照されていない「孤立Workflow」の静的検知。完全な死んだルート判定はランタイムのアクセスログなしには確定できないが、ファイル存否チェックは静的解析で代替できる

詳細は→ ルーティング設計方針

### ドメインごとのレベルオーバーライドの是非

複数のドメインがあるとき、特定のドメインだけ肥大化するのはよくある。これに対し「ドメインAだけLv7の制約を先行適用する」といったドメイン単位の成熟度設定のアイデアがある。

ただでさえ「同じプロジェクト内でアーキテクチャが複数ある」状態でチーム内のコミュニケーションコストが上がっているのに、更にドメインごとにレベルが異なるとなると混乱を招く可能性が高い。「推奨はしないが、やるなら明示せよ」という**許容する禁じ手**として位置付けることも一つの選択肢だが、コミュニティの反応を見てから判断したい。

---

## 😤 最後に
**これが次世代アーキテクチャ「Slime Architecture」や！**


## 🙇 スペシャルサンクス
- Claude 4.6 Sonnet - 高レベル帯や総合監修。
- GPT-5 - 低Lv帯の議論のお供。高Lv帯はコンテキスト溢れで難しくClaudeに移譲
- gemini-3-pro-preview - Infra-Slime構想をはじめとして刺激的でユニークな発想が多かったです
- [mpywさん](https://bsky.app/profile/did:plc:2qva7sggy6ourui2dgzxjvwk) - ラーメンセット🍜奢って前編のFW編 v1.0.0についてレビューしてもらいました。CQRSパターンの汎用性を教えていただき、反映しています。ちなみにmpywさん、ここ見てたらblueskyのDM見てくれると嬉しいです（連絡）

## 😵 本当のオチ
実はこのようなアーキテクチャ進化論って僕が最初に言い出したんじゃなくて、先行文献として「[進化的アーキテクチャ ― 絶え間ない変化を支える](https://www.oreilly.co.jp/books/9784873118567/) 」があるそうです。存在自体知らず、Claudeと高レベル帯がどうあるべきか議論をしてる時に教えてくれました。**特に「アーキテクチャフィットネス関数」という言葉がかなりKaachanの概念と被っているとのこと。**

流石にLaravel参考にしすぎ/具体的な戦略まで掘り下げている/関数型プログラミングベースでうんたらかんたらは出てこないので完全にだだ被りしてることはないと思いますが、抽象的な概念としては学ぶところがあると思うので読まないとな～

## 📓 補足資料

理論家向けにClaude 4.6 Sonnet先生による想定問答集付き

https://qiita.com/u83unlimited/items/69a554c216d7b4bbc1b2
