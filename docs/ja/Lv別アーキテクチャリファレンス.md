# Lv別アーキテクチャリファレンス

> **このドキュメントの目的：** 各Lvの「完成形スナップショット」を提供する。
> 「なぜこの設計か」の根拠・背景は[進化論ドキュメント](./🤤%20僕の考えた最強の次世代Webアプリケーションアーキテクチャ（進化論）.md)と[補足資料](./Kaachan%26Slime%26Slime%20Architecture構想の設計根拠、補足資料.md)を参照。
> このドキュメントは `rules/_content/lv*.md`（AI向けルールテンプレート）の日本語正本として機能する。

---

## Lv1 — ルーティングのみ

### ディレクトリ構造

```
src/
  route.ts    # HTTPルーティングとリクエスト処理のすべて
```

### レイヤールール

| ファイル | やること | やらないこと |
|---|---|---|
| `route.ts` | HTTPルート定義（メソッド・パス・ハンドラー）、インラインハンドラーOK | — |

- `/api` 名前空間は初日から `route.group({ prefix: '/api' })` で確保する（将来のwebルートとの衝突を防ぐため）

```ts
route.group({ prefix: '/api' }, (r) => {
  r.get('/health', (req, res) => res.json({ ok: true }))
  r.post('/users', CreateUserHandler)
})
```

### エラーハンドリング

- 未捕捉のthrowはFWが500にマップ
- 4xxは `res.status(4xx).json(...)` で明示的に返す

### Kaachanが検査する項目

なし（Lv1は最小構成）

### 🆕 Lv1で追加されたこと

初期Lv。すべての起点。

---

## Lv2 — Workflow + Middleware

### ディレクトリ構造

```
src/
  route.ts        # HTTPルーティングのみ
  workflow.ts     # リクエストオーケストレーション
  middleware.ts   # 認証・レートリミット・CORS等
```

### レイヤールール

| ファイル | やること | やらないこと |
|---|---|---|
| `route.ts` | ルート定義・Middleware付与・Workflow指定 | ビジネスロジック・DB・レスポンス生成 |
| `middleware.ts` | 認証・認可・レートリミット・CORS・ロギング | ビジネスロジック・DBクエリ |
| `workflow.ts` | 1リクエストのend-to-endオーケストレーション | Middlewareの責務（認証等） |

- Middlewareはルートごとに**明示的に付与**する（フォルダ規約による自動適用禁止）
- `/health` 等のインフラ用ルートは `/api/` グループの外に置く

```ts
// route.ts
route.group({ prefix: '/api' }, (r) => {
  r.post('/users',    CreateUserWorkflow)                    // Middlewareなし
  r.post('/profile',  slime.auth(), UpdateProfileWorkflow)  // 認証Middleware
  r.get('/admin',     slime.auth({ role: 'admin' }), GetAdminWorkflow)
})
route.get('/health', HealthCheckWorkflow)  // /api/ の外
```

### エラーハンドリング

- Middleware拒否 → 401 / 403 / 429 をMiddlewareから直接返す
- 未捕捉のthrow → FWが500にマップ

### Kaachanが検査する項目

- `route.ts` にインラインのビジネスロジックがある → 💡 Hint

### 🆕 Lv2で追加されたこと

- `workflow.ts`：Controllerに相当。HTTPハンドラーから処理を分離
- `middleware.ts`：横断的関心事の分離

---

## Lv3 — Parse層

### ディレクトリ構造

```
src/
  route.ts        # HTTPルーティングのみ
  middleware.ts   # 認証・レートリミット・CORS等
  workflow.ts     # parse → 処理 → レスポンス
  parse.ts        # リクエストのバリデーションと型変換
```

### レイヤールール

| ファイル | やること | やらないこと |
|---|---|---|
| `route.ts` | ルート定義・Middleware付与・Workflow指定 | ビジネスロジック・DB・レスポンス生成 |
| `middleware.ts` | 認証・認可・レートリミット・CORS | ビジネスロジック・DBクエリ |
| `workflow.ts` | parse呼び出し → 処理 → レスポンス | バリデーションロジック |
| `parse.ts` | `unknown` → 型付き値への変換。失敗時はthrow（FWが400にマップ） | DBアクセス・外部API呼び出し |

- parseは「型変換」のみ行う。業務的なチェック（すでに存在するか等）はLv5のlogicで行う
- `parse.ts` が300行 / 10スキーマを超えたら `parse/` サブディレクトリへ分割

```ts
// parse.ts
export const parseCreateUser = (body: unknown): CreateUserInput => {
  // 型を検証してthrow、または型付き値を返す
  return { name: body.name, email: body.email }
}

// workflow.ts
export const CreateUserWorkflow = async (req, res) => {
  const input = parseCreateUser(req.body)  // parse層
  const user = await db.users.create(input)
  res.status(201).json(user)
}
```

### エラーハンドリング

- parse失敗 → FWが400にマップ
- Middleware拒否 → 401 / 403 / 429
- 未捕捉のthrow → 500

### Kaachanが検査する項目

- `parse.ts` がDB/ORMモジュールをimportしている → ❌ Error
- `workflow.ts` に `req.body` の直接アクセスがある（parseを通していない） → ⚠️ Warning
- `route.ts` にインラインロジックがある → ⚠️ Warning

### 🆕 Lv3で追加されたこと

- `parse.ts`：「Parse, don't validate」原則の導入
- WorkflowがHTTPに依存しなくなる（parseが境界を担う）

---

## Lv4 — Store + Client

### ディレクトリ構造

```
src/
  route.ts        # HTTPルーティングのみ
  middleware.ts   # 認証・レートリミット・CORS等
  workflow.ts     # parse → store/client → レスポンス
  parse.ts        # リクエストのバリデーションと型変換
  store.ts        # DBの読み書きすべて
  client.ts       # 外部API呼び出しすべて（腐敗防止層）
```

### レイヤールール

| ファイル | やること | やらないこと |
|---|---|---|
| `route.ts` | ルート定義のみ | ビジネスロジック・DB |
| `middleware.ts` | 横断的関心事 | ビジネスロジック・DBクエリ |
| `workflow.ts` | parse → store/client → レスポンス、`withTransaction()` でトランザクション管理 | ORM直接import、業務判断 |
| `parse.ts` | 型変換のみ | DBアクセス・外部API |
| `store.ts` | DBの読み書きのみ、ドメイン型で返す | ORMオブジェクトを返す、業務ロジック |
| `client.ts` | 外部APIアクセス、外部エラー→ドメインエラーへの変換 | 業務判断（閾値判定等） |

#### store.ts 命名規則（Lv4推奨 → Lv6でError）

| 種別 | プレフィックス |
|---|---|
| 読み系 | `find*` / `list*` / `get*` / `count*` / `search*` |
| 書き系 | `create*` / `save*` / `update*` / `delete*` / `remove*` |

#### store.ts の重要制約

- **ORM型（`Prisma.User`等）を戻り値に使わない** → 自前の純粋なデータ型のみ返す
- 複数storeをまたぐトランザクションは `withTransaction()` 経由（WorkflowにORM固有のトランザクションAPIを直書きしない）

```ts
// store.ts — ORM型を外に出さない
type User = { id: string; name: string; email: string }  // 自前の型

export const findUserByEmail = async (email: string): Promise<User | null> => {
  const r = await prisma.user.findUnique({ where: { email } })
  if (!r) return null
  return { id: r.id, name: r.name, email: r.email }  // 純粋な型で返す
}

// client.ts — 外部エラーをドメインエラーに変換
export const chargePayment = async (amount: number): Promise<Result<Receipt, "PAYMENT_DECLINED">> => {
  try {
    return ok(mapToReceipt(await stripeClient.charge(amount)))
  } catch (e) {
    if (e.code === 'card_declined') return err("PAYMENT_DECLINED")
    throw e  // TechnicalError → 500
  }
}

// workflow.ts — トランザクションはwithTransaction()経由
await withTransaction(async () => {
  const user = await saveUser(input)
  await saveAuditLog(user.id, 'USER_CREATED')
})
```

### エラーハンドリング

- parse失敗 → 400
- Middleware拒否 → 401 / 403 / 429
- client の `Result.err` → workflow が `throw new Error(code)` → FWがerror mapで4xxにマップ
- 未捕捉のthrow → 500

### Kaachanが検査する項目

- `workflow.ts` がORM/DBモジュールを直接importしている → ❌ Error
- `store.ts` の関数名が命名規則に違反している → 💡 Hint（Lv6でError化）
- `store.ts` がORM型を戻り値に使っている → ⚠️ Warning
- `parse.ts` がDB/ORMモジュールをimportしている → ❌ Error

### 🆕 Lv4で追加されたこと

- `store.ts`：DBアクセスの一元化（ORM型の流出禁止、命名規則、`withTransaction()`）
- `client.ts`：外部API呼び出しの一元化と腐敗防止層

---

## Lv5 — Logic層

### ディレクトリ構造

```
src/
  route.ts        # HTTPルーティングのみ
  middleware.ts   # 認証・レートリミット・CORS等
  workflow.ts     # parse → logic → store/client → レスポンス
  parse.ts        # リクエストのバリデーションと型変換
  store.ts        # DBの読み書きすべて
  client.ts       # 外部API呼び出しすべて
  logic.ts        # 純粋なビジネス判断とドメイン計算
  # 閾値超過後の中間昇格先（Lv6前の整理。将来のドメイン分割の雛形）
  logic/
    user.ts       # userCan* 系の関数
    order.ts      # orderCan* 系の関数
```

### レイヤールール

| ファイル | やること | やらないこと |
|---|---|---|
| `workflow.ts` | データを取得してlogicに渡す（プリミティブを渡す）、Result errをthrowに変換 | 業務判断（それはlogicの仕事） |
| `logic.ts` | 業務判断（Result型）、ドメイン計算・変換（純粋な値） | DBアクセス・外部API・副作用・throw |

#### logic.ts の2種類の関数

| 種類 | 説明 | 返却型 |
|---|---|---|
| 業務判断 | 条件が業務的に通るか否かを評価 | `Result<T, DomainError>` |
| ドメイン計算・変換 | ドメイン固有の計算・フォーマット | 普通の値（失敗しないため） |

#### logic.ts 命名規則（Kaachan強制）

- 業務判断：`userCan*` / `orderCan*` / `paymentCan*` 等（ドメインprefixが必須）
- ドメイン計算：`calcOrder*` / `formatInvoice*` / `applyDiscount*` 等

#### 「LogicがStoreを呼びたくなる」ときの正しい対処

```ts
// NG: Logicの引数設計が間違っている
const userCanCreate = async (email: string) => {
  const user = await findUserByEmail(email)  // ← StoreをLogicから呼ぼうとしている
  return user ? err("EXISTS") : ok()
}

// OK: Workflowがデータを解決してLogicにプリミティブを渡す
const exists = await findUserByEmail(email)  // WorkflowがStoreを呼ぶ
const check = userCanCreate(!!exists)        // LogicはBooleanだけ受け取る
```

#### slime.config.ts でDomainErrorをHTTPコードにマッピング

```ts
export default {
  errors: {
    USER_ALREADY_EXISTS: 409,
    UNAUTHORIZED: 403,
    OUT_OF_STOCK: 422,
    NOT_FOUND: 404,
    PAYMENT_DECLINED: 402,
    // 未登録のthrow → 自動的に500
  }
}
```

### Kaachanが検査する項目

- `logic.ts` が `store.ts` / `client.ts` / DB・ORMモジュールをimportしている → ❌ Error
- logic関数にドメインprefixがない → ❌ Error
- 失敗しうるlogic関数がResult型ではなくthrowしている → ⚠️ Warning
- `logic.ts` が300行 / 10関数を超えている → 💡 Hint（`logic/` への分割を促す）
- `logic.ts` が500行を超えている、またはprefixが混在している → ⚠️ Warning
- logic関数のテストがない → 💡 Hint（Lv7でErrorに昇格）
- `workflow.ts` がORM/DBを直接importしている → ❌ Error（Lv4から継続）
- `store.ts` 命名規則違反 → 💡 Hint（Lv6でErrorに昇格）

### Fat Logic防止戦略（Lv6移行前の4つのアプローチ）

1. **ドメインprefixによる命名規則の強制**（`userCan*`等）
2. **`logic/` フォルダへの中間昇格**（Lv6前の整理、ドメイン分割の雛形）
3. **型依存グラフ解析**（互いに型依存が交差しない関数群を自動検出してドメイン候補を提示）
4. **KaachanとAIの役割分担**（Kaachanが構造的事実を検出、AIが分割案を提案）

### 🆕 Lv5で追加されたこと

- `logic.ts`：業務判断（Result型）とドメイン計算（純粋な値）を分離
- DomainError / TechnicalErrorの二分類とHTTPコードマッピング（`slime.config.ts`）
- Functional Core, Imperative Shell（Logic=純粋なコア、Workflow=命令型シェル）の萌芽

---

## Lv6 — ドメインフォルダ分割

### ディレクトリ構造

```
src/
  app/
    route.ts          # エントリーポイント（domainルートをimportして束ねるだけ）
    workflow.ts       # クロスドメインオーケストレーション（App層）
    parse.ts          # App層のparseとtype変換
    middleware.ts     # App層のMiddleware（認証・レートリミット等）
  shared/
    utility.ts        # 共有の純粋ユーティリティ関数
    smallLogic.ts     # ドメイン切るほどでもない小ロジック（純粋関数のみ）
    store.ts          # ドメイン未分化のDBアクセス（一時置き場）
  client/
    client.ts         # 外部APIアクセス
    adapter.ts        # 腐敗防止層（外部語彙↔ドメイン語彙の変換）
  domainUser/
    routes.ts         # userドメインのルート定義
    workflow.ts       # App層からパース済み入力を受け取る
    logic.ts          # userドメインの業務判断・計算
    store.ts          # userドメインのDBアクセス
  domainOrder/
    routes.ts
    workflow.ts
    logic.ts
    store.ts
```

### レイヤールール

#### ドメインフォルダの原則

| 原則 | 内容 |
|---|---|
| 命名 | `domain[A-Z]camelCase`（例: `domainUser`, `domainOrder`） |
| 自己完結 | 各domainはroutes / workflow / logic / storeを持つ |
| 相互参照禁止 | domain間の直接importは禁止 |
| App層のみ複数domain参照可 | App層だけが複数domainをimportできる |

#### app/ の役割

| ファイル | やること | やらないこと |
|---|---|---|
| `app/route.ts` | domainルートをimportして束ねるだけ | ルート定義・Middleware定義 |
| `app/workflow.ts` | 複数domainをまたぐオーケストレーション | ビジネス判断・DBアクセス・client直接呼び出し |

App層が持ってはいけないもの: `logic.ts` / `store.ts` / `client/`の直接呼び出し

#### shared/ の役割

| ファイル | 内容 | 制約 |
|---|---|---|
| `utility.ts` | 純粋ユーティリティ関数 | 副作用禁止 |
| `smallLogic.ts` | ドメイン切るほどでもない小ロジック | 副作用禁止（DBアクセス不可） |
| `store.ts` | ドメイン未分化のDBアクセス（一時置き場） | 肥大化にアラート |

shared/ はdomainフォルダをimportしない。

#### client/ の役割

- `client/client.ts`：外部API呼び出し（WorkflowはfetchやAxiosを直接使わない）
- `client/adapter.ts`：外部API語彙→ドメイン語彙への変換。外部エラー→DomainError（Result.err）またはTechnicalError（throw）

#### domainXxx/ 内のルール（Lv1〜5のルールが各domainに適用される）

- `workflow.ts`：App層からパース済み入力を受け取る。ORM直接importは禁止
- `logic.ts`：ドメインprefix命名必須、Result型、テスト推奨（Lv7でError化）
- `store.ts`：命名規則違反は**❌ Error**（Lv4の💡 HintからLv6でError化）、ORM型の戻り値禁止

#### domainXxx/routes.ts の構造

```ts
// domainUser/routes.ts
export const userRoutes = (r: Router) => {
  r.get('/users',     slime.auth(), ListUsersWorkflow)
  r.post('/users',    slime.auth(), CreateUserWorkflow)
  r.get('/users/:id', slime.auth(), GetUserWorkflow)
}
```

### Kaachanが検査する項目

- domain間の直接import → ❌ Error
- `app/route.ts` にルート定義がある（集約のみのはず） → ⚠️ Warning
- `store.ts` 命名規則違反 → ❌ Error（Lv4の💡 HintからLv6でError化）
- `store.ts` がORM型を戻り値に使っている → ❌ Error
- `app/workflow.ts` がlogic.ts / store.ts / client/ を直接持つ → ⚠️ Warning
- `app/route.ts` が肥大化している（ルートをdomain/*/routes.tsに移動すべき） → ⚠️ Warning
- Lv4〜5のすべての検査が各domainに適用される

### 🆕 Lv6で追加されたこと

- ドメインフォルダ分割（`app/` / `shared/` / `client/` / `domainXxx/`）
- `domainXxx/routes.ts`：URLパターン・Middleware・Workflowの対応をdomainに同居
- `client/adapter.ts`：腐敗防止層の明示化
- store命名規則違反がErrorに昇格（Lv4の推奨 → Lv6の強制）

---

## Lv7 — cross-フォルダ

### ディレクトリ構造

```
src/
  app/
    route.ts
    workflow.ts
    parse.ts
    middleware.ts
  shared/
    utility.ts
    smallLogic.ts
    store.ts
  client/
    client.ts
    adapter.ts
  domainUser/
    routes.ts
    workflow.ts
    logic.ts
    logic.test.ts   # ← Lv7から必須（ないと❌ Error）
    store.ts
  domainOrder/
    routes.ts
    workflow.ts
    logic.ts
    logic.test.ts
    store.ts
  cross-auth/           # 複数domainにまたがる関心事（認証等）
    logic.ts
    store.ts
  cross-notification/   # 通知配信等
    logic.ts
```

### レイヤールール

#### cross-フォルダの原則

| 原則 | 内容 |
|---|---|
| 命名 | `cross-[kebab-case]`（例: `cross-auth`, `cross-notification`） |
| 作るとき | 2つ以上のdomainが同じロジック・store・clientを必要とするとき |
| 作らないとき | 1つのdomainだけが使う（そのdomainに置く）、純粋ユーティリティ（shared/に置く） |
| import方向 | domain → cross- ✅、cross- → domain ❌、cross- → cross- ❌、cross- → app ❌ |

#### defer() — post-commitフック（Lv7で導入）

| 使用場所 | 動作 |
|---|---|
| `withTransaction()` 内 | DBコミット成功後に実行（ロック時間に含まれない） |
| `withTransaction()` 外 | メイン処理完了後にin-processで即実行 |
| 重い処理・信頼性が必要なもの | Queue（別プロセス）に委ねる |

```ts
// トランザクション内でのdefer() — コミット後にメール送信
return withTransaction(async () => {
  const user = await saveUser(input)
  defer(async () => {
    await sendWelcomeMail(user.email)  // DBロック時間に含まれない
  })
  return user
})
```

#### Lv7のApp層制約（強化）

App層が持ってはいけないもの: `logic.ts` / `store.ts` / `client/`の直接呼び出し

#### ドメイン階層制約（Lv7で追加）

ドメインが入れ子になる場合：上位→下位ドメインの参照のみ可。下位ドメイン同士の参照禁止。

### Kaachanが検査する項目

- `logic.test.ts` が存在しない（domain・cross-問わず） → ❌ Error（Lv5〜6の💡 HintからLv7でError化）
- cross- フォルダがdomainをimportしている → ❌ Error
- cross- フォルダ同士がimportし合っている → ❌ Error
- cross- フォルダがapp/をimportしている → ❌ Error
- App層がlogic.ts / store.ts / client/を直接持つ → ❌ Error
- Lv6のすべての検査が継続

### 🆕 Lv7で追加されたこと

- `cross-フォルダ`：複数domainにまたがる関心事の構造化
- `defer()`：post-commitフックによる副作用の外出し
- `logic.test.ts` 必須：テストなしがErrorに昇格

---

## Lv8 — ドメインイベント

### ディレクトリ構造

```
src/
  app/
    route.ts
    workflow.ts     # domainイベントを受け取り後続workflowに渡す
    parse.ts
    middleware.ts
  shared/
    utility.ts
    smallLogic.ts
    store.ts
    events.ts       # ← Lv8で追加。全domainイベント型定義の置き場
  client/
    client.ts
    adapter.ts
  domainUser/
    routes.ts
    workflow.ts     # 処理後にdomainイベントを返す
    logic.ts
    logic.test.ts
    store.ts
  domainOrder/
    routes.ts
    workflow.ts
    logic.ts
    logic.test.ts
    store.ts
  cross-*/          # ← Lv8でトランザクション専用に特化
```

### レイヤールール

#### shared/events.ts の定義ルール

- イベント型はすべて `shared/events.ts` に集中定義
- イベントは**過去に起きたことを表す**型：`type` フィールドに大文字スネークケースの定数文字列を使う
- `payload` フィールドでイベントデータを持つ
- クラスインスタンス禁止（純粋なデータ型のみ）
- `shared/events.ts` はdomain / cross- を一切importしない

```ts
// shared/events.ts
export type UserCreatedEvent = {
  type: "USER_CREATED"
  payload: { userId: string; email: string }
}

export type OrderPlacedEvent = {
  type: "ORDER_PLACED"
  payload: { orderId: string; userId: string; items: OrderItem[] }
}

export type DomainEvent = UserCreatedEvent | OrderPlacedEvent
```

#### イベントの発行・受信パターン（戻り値方式）

イベントバス（emit/on）は使わない。**domainのworkflowがイベントを戻り値として返す。App層がそれを受け取って後続に渡す。**

```ts
// domainUser/workflow.ts — イベントを返す
export const createUserWorkflow = async (input: ValidatedInput): Promise<UserCreatedEvent> => {
  const user = await saveUser(input)
  return { type: "USER_CREATED", payload: { userId: user.id, email: user.email } }
}

// app/workflow.ts — イベントを受け取って後続に渡す
export const CreateUserWorkflow = async (req, res) => {
  const valid = parseCreateUser(req.body)
  const event = await createUserWorkflow(valid)

  await notificationWorkflow(event)       // 同期・重要な後続処理
  defer(() => analyticsWorkflow(event))   // 非同期・失敗許容な副作用

  res.status(201).json(event.payload)
}
```

イベントバスではなく戻り値方式を選ぶ理由：**イベントのルーティングが `app/workflow.ts` を読めば全部わかる**（emit/onは誰がリスナーかコードを追わないと分からない。バックエンドのドメインイベントは「処理されなかった場合はバグ」なので可視性が重要）。

#### cross-フォルダのLv8特化

Lv8からcross-はトランザクション専用に特化する。

| 処理の性質 | 置き場 |
|---|---|
| 失敗してもロールバック不要な副作用（メール・通知・分析） | ドメインイベント + `defer()` |
| 原子性が必要な複数domain操作（在庫減算と注文作成を同時に） | `cross-` + `withTransaction()` |

```ts
// cross-orderInventory/workflow.ts — トランザクション専用
export const createOrderWithInventory = (input: ValidatedInput) =>
  withTransaction(async () => {
    const event = await orderDomain.createOrder(input)
    await inventoryDomain.deductStock(event.payload.items)  // 失敗したらロールバック
    return event
  })
```

### Kaachanが検査する項目

- `shared/events.ts` が存在しない → ⚠️ Warning
- `shared/events.ts` がdomainやcross-をimportしている → ❌ Error
- イベント型の `type` フィールドが大文字スネークケースでない → ⚠️ Warning
- `cross-` フォルダに `withTransaction()` がない → ⚠️ Warning（「ドメインイベントで代替できるはず」）
- Lv7のすべての検査が継続

### 🆕 Lv8で追加されたこと

- `shared/events.ts`：全domainイベント型定義の集中管理
- ドメインイベントの戻り値方式（イベントバスを使わない）
- cross-フォルダのトランザクション専用化

---

## Lv9 — Ports & Adapters

### ディレクトリ構造

```
src/
  app/
    route.ts
    workflow.ts     # infrastructure実装をdomain workflowに注入する（合成ルート）
    parse.ts
    middleware.ts
  shared/
    utility.ts
    smallLogic.ts
    events.ts
  client/
    client.ts
    adapter.ts
  infrastructure/             # ← Lv9で追加。ORM・外部SDKを直接使える唯一の場所
    user/
      prismaAdapter.ts        # UserPortを実装
    order/
      prismaAdapter.ts        # OrderPortを実装
  domainUser/
    routes.ts
    workflow.ts               # Portを引数で受け取る（ORM依存なし）
    ports.ts                  # ← Lv9で追加。domainが必要とするインターフェース定義
    logic.ts
    logic.test.ts
  domainOrder/
    routes.ts
    workflow.ts
    ports.ts
    logic.ts
    logic.test.ts
  cross-auth/
    logic.ts
    ports.ts
```

> **注意：** `store.ts` はLv9で消滅する。「仕様（ports.ts）」と「実装（infrastructure/*/prismaAdapter.ts）」に分離され、`store` という語はコードベースから消える。

### レイヤールール

#### ports.ts — domainが必要なものを宣言する型定義

- ORMを知らない純粋な型定義のみ（実装コード禁止）
- 「domainはこういう関数が必要だ」という宣言

```ts
// domainUser/ports.ts
export type UserPort = {
  findByEmail: (email: string) => Promise<User | null>
  findById: (id: string) => Promise<User | null>
  save: (user: NewUser) => Promise<User>
  listActive: () => Promise<User[]>
}
```

#### infrastructure/ — Portを実装する唯一の場所

- ORM/外部SDKを直接importできる**唯一の層**
- domainフォルダはinfrastructureを直接importしない
- domain別に整理: `infrastructure/user/`, `infrastructure/order/`

```ts
// infrastructure/user/prismaAdapter.ts
import { UserPort } from '../../domainUser/ports'

export const prismaUserPort: UserPort = {
  findByEmail: (email) => prisma.user.findUnique({ where: { email } })
    .then(r => r ? { id: r.id, name: r.name, email: r.email } : null),
  save: (user) => prisma.user.create({ data: user })
    .then(r => ({ id: r.id, name: r.name, email: r.email })),
  // ...
}
```

#### Workflowがportを引数で受け取る（関数型DI）

DIコンテナもclassも使わない。Portを引数で受け取る関数として実装する。

```ts
// domainUser/workflow.ts
export const createUserWorkflow =
  (port: UserPort) =>           // Portを引数で受け取る
  async (input: ValidatedInput): Promise<UserCreatedEvent> => {
    const exists = await port.findByEmail(input.email)
    const check = userCanCreate(!!exists)
    if (!check.ok) throw new Error(check.error)
    const user = await port.save(input)
    return { type: "USER_CREATED", payload: { userId: user.id, email: user.email } }
  }

// app/workflow.ts — infrastructureをdomainに注入する合成ルート
import { createUserWorkflow } from '../domainUser/workflow'
import { prismaUserPort } from '../infrastructure/user/prismaAdapter'

export const CreateUserWorkflow = createUserWorkflow(prismaUserPort)
```

#### 依存方向

```
domainXxx/workflow.ts  →  domainXxx/ports.ts（インターフェースに依存）    ✅
infrastructure/*/      →  domainXxx/ports.ts（インターフェースを実装）    ✅
app/workflow.ts        →  infrastructure/*/ （具体実装を注入）             ✅
domainXxx/workflow.ts  →  infrastructure/*/ （実装を知ってはいけない）     ❌
infrastructure/*/      →  domainXxx/workflow.ts                            ❌
```

### Kaachanが検査する項目

- `infrastructure/` フォルダが存在しない → ⚠️ Warning
- domainフォルダが `infrastructure/` を直接importしている → ❌ Error
- ORM/DBモジュールのimportが `infrastructure/` 以外に存在する → ❌ Error
- `ports.ts` に実装コード（関数の実装）がある → ❌ Error
- `store.ts` がまだどこかに残っている → ❌ Error（Lv9で消えるべき）
- `logic.test.ts` が存在しない → ❌ Error（継続）

### 🆕 Lv9で追加されたこと

- `ports.ts`：domainが必要とするインターフェースの宣言
- `infrastructure/`：ORM実装の唯一の置き場
- `store.ts` の消滅（ports.ts + infrastructure/ に分離）
- 関数型Ports & Adapters（DIコンテナ不要、class不要）
- Lv5から始まったFunctional Core, Imperative Shellが構造として完成

---

## Lv10 — CQRS

### ディレクトリ構造

```
src/
  app/
    route.ts
    workflow.ts
    parse.ts
    middleware.ts
  shared/
    utility.ts
    smallLogic.ts
    events.ts
  client/
    client.ts
    adapter.ts
  infrastructure/
    user/
      commandAdapter.ts       # UserWritePortを実装（書き込み最適化）
      queryAdapter.ts         # UserReadPortを実装（読み取り最適化）
    order/
      commandAdapter.ts
      queryAdapter.ts
    external/
      stripeAdapter.ts
  domainUser/
    command/                  # ← Lv10で追加。書き込み側
      workflow.ts
      ports.ts                # UserWritePort
      logic.ts
      logic.test.ts
    query/                    # ← Lv10で追加。読み取り側
      workflow.ts
      ports.ts                # UserReadPort
    routes.ts                 # command/queryの両workflowを束ねる
  domainOrder/
    command/
      workflow.ts
      ports.ts
      logic.ts
      logic.test.ts
    query/
      workflow.ts
      ports.ts
    routes.ts
  cross-auth/
    logic.ts
    ports.ts
```

### レイヤールール

#### command/ — 書き込み側

| ファイル | 内容 |
|---|---|
| `workflow.ts` | 状態を変える操作（create / update / delete）。処理後にdomain eventを返す |
| `ports.ts` | WritePortのインターフェース定義のみ |
| `logic.ts` | この domainの業務判断（Result型）|
| `logic.test.ts` | 必須 |

- 前提条件チェック（「このユーザーは存在するか」等）にReadPortを使うことは許容
- レスポンス用のビューモデル生成はquery側の仕事（command側でやらない）

#### query/ — 読み取り側

| ファイル | 内容 |
|---|---|
| `workflow.ts` | 状態を読む操作（get / list / search）。副作用なし |
| `ports.ts` | ReadPortのインターフェース定義のみ |

- 読み取り最適化のデータ構造（非正規化・ビューモデル）を返してよい
- 書き込みモデルと同じ形状に縛られない
- イベントの発行禁止（副作用ゼロ）

#### routes.ts — command/queryを束ねる

HTTPメソッドが自然にCQRSに対応する：

```ts
// domainUser/routes.ts
export const userRoutes = (r: Router) => {
  // Query側
  r.get('/users',       slime.auth(), GetUserListWorkflow)
  r.get('/users/:id',   slime.auth(), GetUserWorkflow)
  // Command側
  r.post('/users',      slime.auth(), CreateUserWorkflow)
  r.patch('/users/:id', slime.auth(), UpdateUserWorkflow)
  r.delete('/users/:id', slime.auth(), DeleteUserWorkflow)
}
```

#### infrastructure/ — 読み書きでアダプターを分離

```ts
// infrastructure/user/commandAdapter.ts — トランザクション・整合性重視
export const userCommandAdapter: UserWritePort = {
  save: (user) => prisma.user.upsert({ ... }).then(mapToUser),
  delete: (id) => prisma.user.delete({ where: { id } }).then(() => undefined),
}

// infrastructure/user/queryAdapter.ts — 読み取り最適化
export const userQueryAdapter: UserReadPort = {
  findById: (id) => prisma.user.findUnique({ where: { id }, select: viewFields }).then(mapToView),
  listActive: () => prisma.user.findMany({ where: { status: 'active' } }).then(rs => rs.map(mapToView)),
}
```

### Kaachanが検査する項目

- domainフォルダに `command/` と `query/` が存在しない → ⚠️ Warning
- `query/workflow.ts` がWritePortをimportしている → ❌ Error
- `query/workflow.ts` が書き込み操作を行っている → ❌ Error
- `command/workflow.ts` が読み取り最適化ビューモデルを返している → ⚠️ Warning
- `logic.test.ts` が `command/` に存在しない → ❌ Error
- ORM/DBのimportが `infrastructure/` 以外にある → ❌ Error（継続）
- Lv9のすべての検査が継続

### 🆕 Lv10で追加されたこと

- `command/` / `query/` フォルダ：読み書きをフォルダ構造で分離
- 読み書きそれぞれのPort・infrastructure実装
- 「書き込みは整合性重視、読み取りはビュー最適化」の構造的分離
- Lv4の命名規則（`find*` / `save*` 等）がLv10のCQRS構造として完成

---

## 全Lv対照表

| Lv | 主要ファイル/フォルダ | 主なテーマ |
|---|---|---|
| 1 | `route.ts` | ルーティングのみ |
| 2 | + `workflow.ts` `middleware.ts` | Controller分離・Middlewareゲート |
| 3 | + `parse.ts` | Parse, don't validate |
| 4 | + `store.ts` `client.ts` | レイヤードアーキテクチャ・ORM隠蔽・腐敗防止層 |
| 5 | + `logic.ts` | Functional Core（Result型・純粋関数・ドメインprefix） |
| 6 | `app/` `shared/` `client/` `domainXxx/` | ドメイン分割・store命名がError化 |
| 7 | + `cross-*/` + `logic.test.ts` + `defer()` | クロスドメイン構造化・テスト義務化・post-commitフック |
| 8 | + `shared/events.ts` | ドメインイベント（戻り値方式）・cross-のトランザクション専用化 |
| 9 | + `ports.ts` + `infrastructure/` | Ports & Adapters・store.ts消滅・関数型DI |
| 10 | `command/` `query/` | CQRS・読み書きの構造的分離 |

## Kaachanエスカレーション対照表

| 検査項目 | Lv4 | Lv5 | Lv6 | Lv7 | Lv8+ |
|---|---|---|---|---|---|
| store命名規則違反 | 💡 Hint | 💡 Hint | ❌ Error | ❌ Error | ❌ Error |
| logic.test.ts なし | — | 💡 Hint | 💡 Hint | ❌ Error | ❌ Error |
| logic.ts肥大化（300行/10関数） | — | 💡 Hint | 💡 Hint | 💡 Hint | 💡 Hint |
| logic.ts肥大化（500行/prefix混在） | — | ⚠️ Warning | ⚠️ Warning | ⚠️ Warning | ⚠️ Warning |
| workflow→ORM直接import | ❌ Error | ❌ Error | ❌ Error | ❌ Error | ❌ Error |
| logic→store/clientのimport | — | ❌ Error | ❌ Error | ❌ Error | ❌ Error |
| domain間の直接import | — | — | ❌ Error | ❌ Error | ❌ Error |
| cross-→domainのimport | — | — | — | ❌ Error | ❌ Error |
| store.tsが残存（Lv9以降） | — | — | — | — | ❌ Error |
