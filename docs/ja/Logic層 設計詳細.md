> **位置づけ：** Logic層の定義・境界・周辺問題についての議論まとめ。アーキテクチャ文書・補足資料への反映元として使用する。

---

## Logic層の定義（現状文書からの拡張）

現状のアーキテクチャ文書はLogicを「Decision Objectパターン」として説明しており、**Result型を返す業務判断関数**に焦点が当たっている。これは正しいが不完全で、Logic層が担う関数は2種類ある。

### Logic層が担う2種類の関数

| 種類 | 説明 | 返却型 |
|---|---|---|
| **業務判断** | 条件が業務的に通るかNOかを評価する | `Result<T, DomainError>` |
| **ドメイン計算・変換** | ドメイン固有の計算・フォーマット・変換 | 普通の値（失敗しないため） |

```ts
// 業務判断（Result型）
export const userCanCreate = (alreadyExists: boolean): Result<void, "USER_ALREADY_EXISTS"> =>
  alreadyExists ? err("USER_ALREADY_EXISTS") : ok(undefined)

// ドメイン計算（Result型不要）
export const calcOrderTotal = (items: Item[]): number =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0)

export const applyDiscount = (price: number, coupon: Coupon): number =>
  price * (1 - coupon.rate)

export const formatInvoiceNumber = (id: number, prefix: string): string =>
  `${prefix}-${String(id).padStart(6, '0')}`
```

**共通条件：** どちらも純粋関数（状態なし・副作用なし・DB/API呼び出しなし）

「Result型を返さないものはLogicではない」という誤読を防ぐため、文書に明記が必要。

---

## LogicはStore/Clientを呼べない

### Laravelとのメンタルセットの違い

LaravelのServiceクラスはRepository（DB）・外部APIクライアントの両方を呼び出せる「全部やる」層だった。

```
Laravel Service（"全部やる"）
        ↓ 分解
Slime Logic（"判断・計算する"）＋ Slime Workflow（"指示する"）
```

Logic層に相当するのはServiceの「中身」であり、Serviceクラス全体ではない。**LogicはStoreもClientも呼べない。** これは意図的な制約。

### なぜStore/Clientを呼べないか

1. **テスト性の保証**
   Logicが純粋関数であることで、DBもAPIもモック不要でテストが書ける。LogicがStoreを呼べるようにした瞬間、「Lv5でテスト義務化した」根拠の大半が消える。

2. **FatLogic化の防止**
   LogicがStoreを呼べるなら、Workflowは「Logicを呼ぶだけ」のパススルーになる。LogicはLaravelのFat Serviceと同じ問題を再現する。

3. **Functional Core, Imperative Shell**
   Logic＝純粋なコア、Workflow＝命令型のシェル。LogicにI/Oを持ち込むとこのパターンが崩れる。

4. **Lv9 Port注入の整合性**
   Lv9でWorkflowにPortを注入する設計が成立するのは、LogicがPortを必要としないから。LogicもStoreを呼ぶなら、LogicにもPort注入が必要になり注入の連鎖が広がる。

### 「LogicがStoreを呼びたくなる」ときの正しい対処

LogicがStoreを呼びたくなるのは、**Logicの引数設計が間違っているサイン**。

```ts
// NG: LogicがDB検索したくなる設計
const userCanCreate = async (email: string): Result<...> => {
  const user = await findUserByEmail(email)  // ← Store呼びたくなる
  return user ? err("EXISTS") : ok()
}

// OK: Workflowがデータを解決してLogicにプリミティブを渡す
const exists = await findUserByEmail(email)   // Workflow がStoreを呼ぶ
const check = userCanCreate(!!exists)         // Logic はbooleanだけ受け取る
```

**Logic関数の入力は常に「解決済みのデータ（プリミティブ・すでに取得済みの値）」にする。** これによりLogicは構造的にStoreを必要とせず、純粋関数として保たれる。

---

## 「副作用ありResult型」の扱い

### 現状の文書の空白

現在の設計は「DomainError（Result.err）はLogicからしか生まれない」と暗黙的に仮定している。しかし外部システム（支払いAPI等）もビジネス上の理由で処理を拒否しうる。

| エラーの種類 | 例 | 正しい扱い |
|---|---|---|
| TechnicalError | ネットワーク障害・タイムアウト | throw → 500 |
| DomainError（純粋評価） | USER_ALREADY_EXISTS | Logic.err → 4xx |
| **DomainError（外部拒否）** | 支払い拒否・残高不足 | **Adapter.err → 4xx** |

### Adapter層が担う責務

`client/adapter.ts` は「外部システムの語彙→ドメインの語彙への変換（腐敗防止層）」を担う。この変換はエラーの変換も含む。

```ts
// client/adapter.ts
// 副作用あり（APIコール）+ Result型 → Adapterの仕事
export const chargePayment = async (amount: number): Promise<Result<Receipt, "PAYMENT_DECLINED">> => {
  try {
    const res = await stripeClient.charge(amount)
    return ok(mapToReceipt(res))
  } catch (e) {
    if (e.code === 'card_declined') return err("PAYMENT_DECLINED")  // DomainError → Result.err
    throw e  // TechnicalError → throwのまま → 500
  }
}
```

WorkflowはLogic由来とAdapter由来のResult.errを同様に扱える：

```ts
// Workflow
const check = userCanCreate(!!exists)          // Logic: 純粋評価
if (!check.ok) throw new Error(check.error)

const payment = await chargePayment(amount)    // Adapter: 副作用あり
if (!payment.ok) throw new Error(payment.error)
// どちらも同じパターンでFWのエラーハンドラに渡る
```

### Adapterがやってはいけないこと

Adapterは「翻訳」するが「業務判断」しない：

```ts
// OK: 外部コード→ドメインエラーへの翻訳
if (res.code === 'card_declined') return err("PAYMENT_DECLINED")

// NG: Adapterが業務判断を持ち込む
if (res.code === 'card_declined' && user.retryCount > 3) return err("CARD_BLOCKED")
// ↑「3回以上なら」という閾値判断はLogicの仕事
```

---

## ドメイン知識の散在問題と検知の限界

### 「システム起因かドメイン起因か」問題

業務判断のうち「30日ログインなし」「価格がゼロ以下」等は、システム的不変条件とドメインルールの両方の意味を同時に持つケースがある。この境界は概念上は判定可能だが、**判定に必要な情報がコードの外（ビジネスの知識）にある**。

```ts
findUsersNotLoggedInSince(Date.now() - 30 * 24 * 60 * 60 * 1000)
```

「30日」がキャッシュ有効期限（システム）か休眠ユーザーの業務定義（ドメイン）かは、ASTを見ても分からない。

### Kaachanが検知できる範囲の限界

| 違反の種類 | 検知可否 |
|---|---|
| LogicからのStore/Client import | ✅ importグラフ解析で検知可能 |
| Storeにハードコードされた業務閾値 | △ 数値リテラル検出は可能だが精度が低い |
| Adapter内の業務分岐 | ❌ 意味的判定は不可能 |

**構造的違反（importの向き）は検知できるが、意味的違反（業務ルールの染み出し）はほぼ検知できない。**

これはAIでも同じ制約にぶつかる。AIもドメイン知識なしには「この閾値はビジネスルールか」を判定できない。

### AI時代も未解決のままな理由

ドメイン知識の散在問題は、AI時代になっても本質的には解決していない。静的解析の限界をAIが超えるには、そのビジネス固有の文脈が必要であり、その文脈はコードリポジトリには存在しない。

これは設計の欠陥ではなく**情報論的制約**：コードは「何をするか」を表現するが、「なぜそれがビジネスルールなのか」は表現しない。

### rulesファイルの本質的役割

`slime export:rules` が生成するrulesファイルは、この制約を解く唯一の実用的な手段：

> **「コードの外にある業務知識」をAIに渡す経路**

```
# rules例（Lv5）
- 業務的な閾値（「30日」「3回以上」等）はLogic関数に書く
- Store関数はパラメータで閾値を受け取る（内部でハードコードしない）
- Logic関数の引数は解決済みのプリミティブ値のみ（Storeを呼ばない）
- Adapter関数は外部エラーコードをドメインエラー文字列に変換するが、業務分岐はしない
```

Kaachanが構造違反を検知し、rulesファイルがAIに意味的判断の文脈を渡す。この役割分担がLogic層の設計を実用的に支える。

---

## 文書反映時の変更箇所まとめ

### アーキテクチャ文書（進化論）Lv5セクション

- Logicの定義を「業務判断（Result型）」だけでなく「ドメイン計算・変換（純粋関数なら可）」を含むよう拡張
- 「Result型返却必須」の表現を「失敗しうる場合はResult型必須（throwしない）」に修正
-「LogicはStoreを呼べない」「Logicの入力はプリミティブであるべき」を明記
- LaravelのServiceとの対応関係（分解の図）を追加

### 補足資料（ADR）

- ADR-Lv5に「副作用ありResult型の扱い（Adapter層）」を追加
- ADR-Lv5に「ドメイン知識の散在問題とKaachanの限界・rulesファイルの役割分担」を追加

### FW文書

- Lv5のKaachanお叱りポイントに「LogicからのStore/Client import」を ❌ Error として追記
- DomainErrorマッピング説明を「LogicのResult err」だけでなく「Adapterがres.errで返す場合も含む」よう拡張
