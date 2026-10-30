> **位置づけ：** 本ドキュメントはSlime ArchitectureおよびKaachanの設計根拠、各Lvの設計理由の記録（ADR）、外部ツール対応方針、想定問答を集めた開発用資料。概要は アーキテクチャ（進化論） を参照。

https://qiita.com/u83unlimited/items/86c9b0f5571e3e802ace

大体Claude先生に書いてもらいました。ちゃんと読んでます。

## 📝 各LvのADR（設計理由の記録）

### ADR-Lv3：なぜWorkflowはHTTPに依存しない設計になっているか

ExpressやHonoのハンドラは `(req, res)` を受け取るのでHTTPと不可分になる。NestJSのControllerも同様で、テストにはDIコンテナごとセットアップが必要になる。LaravelのControllerも `Request` オブジェクトを受け取る設計のため、バッチ処理ではCommandファイルから迂回してServiceを直呼びするしかない。

Slimeでは **Parse層がHTTP境界を担う** という設計判断をした。Parseが `unknown` → 純粋な型への変換を担うことで、Workflowの引数は「どこから来たか」を問わないただのデータになる。結果としてWorkflowはルーティング・テスト・イベント・バックグラウンドジョブのどこからでも同じインターフェースで呼び出せる。

具体的には、route定義が`json(parse, workflow)`のような応答形式の関数でparseとWorkflowを組み合わせる。Workflowは型付きの入力と、Middlewareが確定したプリンシパル（誰の権限で実行されているかを表す値）だけを受け取り、HTTPのリクエストやレスポンスには触れない。HTTP以外の起動口も、同じ形の入力とプリンシパルを作って呼ぶ。

なお実践例（vote-system）では、Hono の Context を受け取って Response を返す Workflow でも問題なく回った。それでもこの形を採らないのは、Lv6以降で「WorkflowはHTTP以外の起動口からも呼ばれる」ことを高レベル帯の前提にしているからである。Cookieやリダイレクトのように HTTP 固有の操作が必要なルートだけは、route.ts に HTTP の入出力だけを行う薄いハンドラーを書いて吸収する。

```ts
// テストでHTTPを偽装する必要がない。ただの関数呼び出し
const result = await CreateUserWorkflow({ name: 'foo', email: 'foo@example.com' })
```

Laravelユーザー向けに言えば「ControllerとCommandを足したもの」がWorkflow。起動口の違いをParse側で吸収することで、ビジネスロジックの入口を1つに統一するのがこの設計の意図。

---

### ADR-Lv5：なぜ業務上の拒否だけをResult型で運ぶのか（ROPの射程）

Result型（ok/err）を業務上の拒否だけに使い、技術的な障害にまで拡張しない理由は「throwの意味論」にある。

- **throw** = 「想定外のことが起きた」（DBが落ちた・ネットワークエラー・プログラムのバグ）→ TechnicalError → 500
- **Result err** = 「想定内のビジネス上の拒否」（すでに存在する・在庫不足・権限なし）→ DomainError → 4xx

`userCanCreate`が`err("USER_ALREADY_EXISTS")`を返すのは「例外が起きた」のではなく「業務的にNOという判断が出た正常系」だ。これをthrowで表現すると「USER_ALREADY_EXISTSというバグが発生した」と読めてしまい、意味論的なズレが生じる。Result型に懐疑的な立場の人も「業務的な拒否をthrowで表現するのは変」という点はわりと同意する（Javaの検査例外と非検査例外の分類に近い問題意識）。

業務上の拒否だけをResult型にするのは「趣味でResult型を使いたい」のではなく、**throwの意味論が正確に表現できない種類のエラーが業務上の拒否に集中している**という構造的な理由がある。

Result型で運ぶ範囲は、**業務上の拒否が生まれる場所（Logicと、外部の拒否を翻訳するclient/adapter）から、それをHTTPの応答に変えるroute（応答形式の関数`json(...)`）まで**である。Workflowは受け取ったerrをthrowに変えず、早期returnでそのまま上に返す。こうすることで「このルートが返しうるエラー」が型に現れる。対応表への登録漏れはコンパイル時に分かり、ルートごとのエラー応答はOpenAPIに出力できる。

ROPをStore・Parseにまで拡張すること（全層Result型統一）は技術的には可能だが、Store/ParseのエラーはInfraError・ParseErrorというTechnicalErrorに近い性質を持ち、Result型で管理するメリットが薄くなる。現設計の境界線は、throwの意味論と最も齟齬のない線として選ばれた。

> **改訂の経緯**：旧版では「Logicだけ」Result型とし、WorkflowはResult errを受け取って`throw new Error(code)`に変換していた。Result型を全面に押し出すのは学習コストが高すぎると考えたためである。しかしこの形では、業務上の拒否が文字列の例外になって型の情報が消え、対応表への登録漏れが本番の500で初めて見つかる。また「業務上の拒否は例外ではない」というこのADR自身の主張とも矛盾していた。そこで、Result型を持ち込むのはLv5（Logic導入時）からのまま、運ぶ範囲をrouteまで延ばした。Result型がまだないLv3〜4では、型つきの`DomainError`をthrowする簡易な形で業務上の拒否を表す。

---

### ADR-Lv5：ResultAsync（チェーン専用型）を採用しない理由

WorkflowがResult型を返す場合（Lv5以降）、`Promise<Result<T,E>>`を`.andThen()`でチェーンするために`ResultAsync`という専用ラッパー型（neverthrow等が提供）が必要になる。これを採用しない理由：

1. **チェーンスタイルは現代TS文化と相性が悪い**：`async/await`の普及により`.then()`チェーンは「古いスタイル」と認識されるようになった。`.andThen()`も同じ印象を与えやすい
2. **チェーンのためだけに専用型を導入するのは本末転倒**：`ResultAsync`はチェーン記法を可能にするためのラッパーに過ぎず、それ自体がROPの本質ではない
3. **早期returnスタイルで同じ目的を達成できる**：`Promise<Result<T,E>>`を返す関数に対して`if (result.isErr()) return err(result.error)`という早期returnを使えば、チェーンなしでthrowを排除できる。これは`async/await`の逐次記述と同じ文化に乗っており、Logicのthrow禁止によって自然に定着するスタイルと一致する

```ts
// ResultAsyncチェーン（採用しない）
return ResultAsync.fromResult(parse(input))
  .andThen(valid => port.findByEmail(valid.email))
  .andThen(exists => userCanCreate(!!exists))

// Promise<Result> + 早期return（採用するスタイル）
const parseResult = parse(input)
if (parseResult.isErr()) return err(parseResult.error)

const existsResult = await port.findByEmail(parseResult.value.email)
if (existsResult.isErr()) return err(existsResult.error)
```

なお、JavaScriptにはRustの`?`演算子に相当する「Result errなら即early returnする」構文がなく、この冗長さはTS/JSの言語仕様の限界によるものだ。TC39のpipe演算子提案も長年Stage 2で止まっており、当面は早期returnが最も実用的なTS慣用句として扱う。

---

### ADR-Lv8：なぜイベントバス（emit/on）ではなく戻り値方式を選んだか

イベントバス方式（`slime.emit()` / `slime.on()`）は実装例が多い（Laravel Eventも内部的にこの構造）が、「誰がこのイベントを聞いているか」がコードを追わないと分からないという問題がある。JavaScriptの `addEventListener` と同じ不可視性の問題だ。

バックエンドのドメインイベントはフロントエンドのUIイベントと異なり、「注文が確定した→注文者にメールを送りたい」のようにビジネス上の必然的な後続処理が主であり、**処理されなかった場合はバグ**になる。**このため「誰が聞くかが見えない」設計はリスクが高く、繋がりを把握したい需要も高い。**

戻り値方式（Option A）ではApp層を読めば全体の流れが把握でき、型によって後続処理の存在が保証される。イベントバスが活きるのは複数チームがそれぞれハンドラを追加するプラグイン設計・マイクロサービス規模の話であり、Lv8-10のモノリスには過剰と判断した。

---

### ADR-Lv5〜：なぜドメインの名前をAIに提案させ、出所ラベルを付けるのか

構想の初期は、ドメインモデリングを人間がやるべき仕事と位置づけていた。「どこで切るか」は静的解析では判断できず、ドメインの知識はリポジトリの外にあるからだ。

ところが「検知は機械、提案はAI、裁可は人間」を実際に運用すると、AIが候補のまとまりと名前を出し、人間がそれを問い直す形で、本質的な議論が進んだ。人間がゼロから考えるより、たたき台の名前があったほうが「それは何を指すのか」という問いが立ちやすい。そこで、AIの役割を「分割案の提案」から「名前の提案」にまで広げた。

ただし、AIが付けた名前は、文書やコードに一度書き込まれると既存の言葉のように見えてしまう。**出所ラベル**（既存語彙／AI造語）はこの対策で、既存語彙を「人間の発話か裁可までたどれる言葉」に限っている。

あわせて2つを取り入れた。

1. **現状維持も正当な結論にする**：分割・統合にはimportの書き換えのコストがかかり、常に分けたほうがよいとは限らない
2. **逆方向（統合・切り直し）も提案の対象にする**：行数・関数数の閾値は、コードが育つ一方向にしか反応しない。分けすぎや軸の誤りは、co-changeや責務の重複を意味で読まないと見つからない。Kaachanが拾える兆候も💡 Hintに留める。Errorにすると、人間は正当化を書いて黙らせるだけになるからだ

---

### ADR-Lv9：storeという名前の来歴と分離

`store.ts` はLv4からLv8まで「DB操作を1箇所に集める実用的な層」として機能してきた。「ORMを使ってDBにアクセスする実装」と「ドメインが必要とする関数の仕様」が1ファイルに混在する形だったが、それで十分だった段階では十分だった。

Lv9でこの混在が解消されるとき、`store.ts` は仕様（`ports.ts`）と実装（`infrastructure/`）に分離し、`store` という語はコードベースから消える。これは「storeが不完全なまま終わった」のではなく、**Ports & Adapters（ヘキサゴナルアーキテクチャ）として正式化された**結果だ。DBアクセスを1箇所に集めるという役割は完成し、「仕様と実装を分離する」という構造に発展した。

**CA/DDDを知っている読者へ**：`store.ts` はDDDのRepository Patternが担う役割と同等のもの──「ドメインが必要とするデータ操作を外部実装から切り離す層」──を果たしています。Repository PatternはOOP文脈ではinterfaceと実装の分離で実現しますが、Lv4-8の `store.ts` はその分離が済んでいない「実装を含む混在層」です。Lv9でPorts & Adapters（ヘキサゴナルアーキテクチャ）として正式化されるとき、`store.ts` は「Repositoryが本来やろうとしていたこと」の関数型実装として完成します。Repository ⊂ Ports & Adapters という包含関係を踏まえれば、`store.ts` はRepositoryパターンの練習台ではなく、より大きな概念の入口として機能していたと解釈してください。

---

### ADR-Lv9：なぜPorts & AdaptersにDIコンテナを使わないか

OOP版のPorts & AdaptersではinterfaceとDIコンテナでPortを注入するのが一般的だ。Slimeでは関数型実装（Portを引数で受け取る）を採用している。理由：

1. **TypeScriptのclassはTSの本流ではない**：TSの強みである型推論・ユニオン型・構造的部分型はclassとの相性が悪い場合が多い
2. **DIコンテナは学習コストが高い**：Lv9に到達したユーザーがDIコンテナの概念を理解していないケースが多い
3. **関数の部分適用で同じことができる**：`createUserWorkflow(prismaUserPort)` で返ってきた関数はDIされた関数と同等の振る舞いをする

---

### ADR-Lv10：なぜCQRSはLv10なのか（Lv6でよいのでは）

CQRS（読み書きモデルの分離）はLv6でドメイン分割が始まった時点で導入可能だが、Lv10まで遅らせた理由：

1. **Ports & Adaptersが先**：実装と仕様が混在した状態で読み書きを分割すると複雑さが倍になる。Lv9でドメインをインフラから独立させた後、CQRSで読み書きを分けるのが自然な順序
2. **Lv4の伏線**：Lv4でQuery/Command命名規則を入れることでCQRSの概念を先行導入し、Lv10で構造として完成させる3ステップ設計（命名で意識→仕様を明文化→構造で分離）
3. **高レベル帯まで見据えたユーザーへのご褒美**：Lv10まで到達したユーザーへの最後の贈り物として位置づける


## ⚔️ 場外戦（Claude 4.6 Sonnet先生による想定問答集）

### Q. 「Lv4-8のstore.tsはRepository Patternとして不完全だ」

**A.** `store.ts` は最初からRepository Patternを名乗っていないため、「不完全」という評価軸は当てはまらない。

`store.ts` はLv4-8において「DBアクセスを1箇所に集め、純粋なドメイン型だけを返す」という実用的な足場として機能する。DDDのRepository Patternが本来想定する「インターフェースと実装の分離」を最初から強制すると、Lv4の時点でPorts & Adaptersの概念を全て理解していないと使えないFWになる。

Lv9でPorts & Adapters（ヘキサゴナルアーキテクチャ）として正式化されるとき、`store` という語は消え `ports.ts` + `infrastructure/` に分離する。これは「失敗した」のではなく、DBアクセスを1箇所に集めるという役割を完了した上で、仕様と実装を分ける次の段階に発展した結果だ。Repository Pattern ⊂ Ports & Adapters という包含関係を踏まえれば、`store.ts` は最終的により大きな概念として完成していると解釈できる。

---

### Q. 「WorkflowはDDDのApplication Service / Use Caseと何が違うのか。独自用語を使うのは混乱を招く」

**A.** 段階的に意味を洗練させるための意図的な命名だ。

Lv2のWorkflowはHTTPハンドラに近くControllerと呼んでも差し支えない。Lv9のWorkflowはApplication Serviceに近い。同じ用語が段階的に責務を絞られていく──これはSlime Architectureのレベル設計全体の構造であり、Workflowもその一つだ。

Application ServiceやUse Caseという用語をLv2で使うと「DDDの文脈を理解していないと意味が分からない用語」になる。Workflowは「処理の流れを担うもの」として直感的に理解しやすく、低レベルでの学習障壁を下げる効果がある。高レベル帯でApp層WorkflowとDomain WorkflowをKaachanのエラーメッセージで区別することで、用語の曖昧さを制約で補う設計になっている。

---

### Q. 「関数型プログラミングを謳うならthrowを許容するのは矛盾だ。Result型を最初から強制すべき」

**A.** Gary Bernhardtの **"Functional Core, Imperative Shell"**（Strange Loop 2012）が理論的根拠になる。

純粋なコア（Logic）と命令型のシェル（Workflow）を分ける設計であり、シェル側のthrowは技術的な障害に限って許容される。Lv5以降でLogicのthrowを禁止し、業務上の拒否をResult型でrouteまで運ばせるのはこのトレードオフの現実的な落とし所だ。TypeScriptはHaskellではなく、100%純粋関数型を強制することがこのFWの目的でもない。

またLv1-4でResult型を強制すると、初学者が「なぜ`ok()`と`err()`でラップしないといけないのか」を理解する前に挫折するリスクが高い。小規模アプリでは`throw`で即座に500エラーにしてしまっても許容範囲が広く、学習曲線を考慮したレベルデザインとして正しい判断だと考えている。

---

### Q. 「Result型を業務上の拒否だけに限定するのはROPとして中途半端では？全層に統一すべきでは？」

**A.** ROPはthrowをゼロにする設計論ではなく、「throwの意味論が合わない箇所からthrowを追い出す努力」だ。

throwには「想定外の技術的障害（TechnicalError）」という固有の意味がある。DBが落ちたときや外部APIが返答しないときにthrowが発生するのはJS/TSのエコシステム全体の慣行であり、これをResult型に変換しても「技術的障害をResult errで表現する」設計になるだけで本質的な改善にならない。

逆にLogicのビジネス判断（`USER_ALREADY_EXISTS`・`OUT_OF_STOCK`等）は「想定外のことが起きた」ではなく「業務的にNOという判断が出た正常系」であり、throwで表現することが意味論的に正しくない。この不一致が、業務上の拒否だけをResult型で運ぶ根拠だ。

加えてTS/JSでは外部ライブラリが内部でthrowを使うケースが静的に検知できない。全層をResult型統一してもFW境界での未捕捉throwを受け止めるcatch-allは必須であり、「完全にthrowを排除したアーキテクチャ」はTS/JSでは実現不可能だ。ROPはその現実を踏まえた上で「意味論的に正しい種類のエラーだけResult型で運ぶ」設計として理解するのが正確だ。

---

### Q. 「CQRSはEvent Sourcingとセットで使うものだ。切り離して使うのは本来の意図と違う」

**A.** Greg Young自身が「CQRSはEvent Sourcingなしに適用できる」と明言している。

Slimeが採用しているのはGreg Young型の軽量CQRSであり、読み書きモデルの**構造的非対称性を解決するため**の採用だ。「書き込みは集約境界を厳守、読み取りは越境JOINもOK」という非対称なルールをフォルダ構造で表現することが目的であり、パフォーマンス最適化やEvent Sourcingは目的ではない。

この解釈はmpywさんの発信にも通じるもので、CQRSが有効なのは高負荷システムに限らず「読み取りが複雑でドメイン境界を越えがちなシステム全般」に適用できるというのが近年再評価されている文脈だ。

---

### Q. 「段階的にアーキテクチャを変えるのはむしろ技術的負債を生む。最初から正しい設計をすべきだ」

**A.** これが最も根本的な前提の違いで、土俵が違う議論だ。

「最初から正しい設計を選べ」という前提には「最初から正しい設計を選べる人間がいる」という仮定が含まれている。現場の現実は「スモールスタートで始まり、成功に伴ってスケールが必要になる」であり、Lv10相当の設計をLv1のコードベースに適用するのはオーバーエンジニアリングだ。

理論的根拠はO'Reillyの **「進化的アーキテクチャ ― 絶え間ない変化を支える」**（Ford, Parsons, Kua）が提供している。「アーキテクチャはインクリメンタルに進化すべき」という主張と、**アーキテクチャフィットネス関数**（自動化されたチェックによってアーキテクチャ特性を守る仕組み）はKaachanの設計と直接対応する。著者がこの本の存在を知らずに独立して導き出した答えが同書と収束したという事実は、構想の正しさの傍証になっている。

また段階的移行の最大のリスクである「Lv間マイグレーションで参照が壊れる」問題は、`slime migrate`コマンドのインタラクティブUI・Dry Runで対処する設計になっている（実装難易度が最も高い課題として残課題にも明記している）。

---

### Q. 「Lvはコードの整理術にすぎない。パフォーマンスやキュー導入で設計が変わる話を扱っていない」

**A.** その通りで、意図的に扱っていない。Lvは「コード規模が増えたときの認知負荷」の軸であり、「負荷・信頼性」の軸とは独立している。Lv3でも100万ユーザーいればキューが要るし、Lv9の社内ツールには要らない。2つの軸を1本のLvに混ぜると、どちらの判断も歪む。

ただし層の構造はキュー導入を吸収できるように作ってある。Parse層がHTTP境界を担い、Workflowは起動口を知らないので、キューを入れてもWorkflow / Logic / Storeの置き場所は変わらない。変わるのは投入の確実性（Outbox）・冪等性・リトライの判断といった「実行の意味」の方で、これは業務上の拒否と技術的障害の2分類がそのままリトライ可否の基準になる。パフォーマンス対策も大半はStore・Client・インフラの中で閉じる。

Kaachanの検査は、Lvではなく「コードにキュー起動口があるか」という能力（capability）で有効にする案を検討している。詳細は→ [非同期・キュー導入 設計方針](./非同期・キュー導入%20設計方針.md)

---

### Q. 「Parse, don't validateはHaskellの概念でTypeScriptに適用するのは無理がある」

**A.** すでにTypeScriptコミュニティのメインストリームになっている。

Alexis Kingの[Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)（2019）はHaskellコミュニティ発の概念だが、ZodやValibotはこの思想を直接ベースに実装されたTypeScriptライブラリであり、現在のTS界隈で広く使われている。「TypeScriptに無理がある」どころか、すでに標準的なプラクティスとして定着している。

---

## 🔌 プロトコル対応方針（GraphQL / gRPC / tRPC）

Slime ArchitectureはHTTPベースのREST APIを基本形として設計されているが、GraphQL・gRPC・tRPCとの併用についての方針を整理する。

**共通の原則：Slime本体のWorkflow/Logic/Parse構造には影響させない。プロトコルの差異はアダプター層が吸収する。**

### GraphQL → 前段ゲートウェイ方式

GraphQLはリクエスト構造がSlimeの設計と根本から相性が悪い。

- **Resolver粒度の問題**：GraphQLのResolverは「フィールド単位」で動作するが、Slimeの処理単位は「Workflow単位（＝ユースケース単位）」。Resolverが肥大化するとWorkflowとResolverの責務が混乱する
- **N+1問題**：GraphQLのResolverを素直に実装するとN+1クエリが発生しやすく、DataLoaderによる解決がアーキテクチャの複雑性をさらに増す
- **Parse層との乖離**：GraphQLのquery/mutation構造はHTTP `req.body` とは異なり、既存のParse層のインターフェースがそのまま使えない

**対応策**：GraphQL専用の前段ゲートウェイ（Apollo Gateway、GraphQL Mesh等）をSlimeの外側に置き、Slimeを純粋なデータAPIサーバーとして消費する構成を取る。

```
[GraphQL Client]
       ↓
[GraphQL Gateway]  ← GraphQL固有の複雑さをここで吸収する
       ↓
[Slime App（REST）] ← 普通のWorkflow/Parse/Logic構造を維持
```

### gRPC → サービス間通信のトランスポートとして対応（Lv8以降）

gRPCはHTTP/2ベースのバイナリプロトコルで、主にサービス間の低レイテンシ通信に使われる。Slime ArchitectureではLv8以降で複数サービス間の協調が設計課題として浮上するため、gRPCの登場はこのタイミングが自然。

- **client.ts層での対応**：外部サービスへのgRPC通信は `client.ts` のトランスポートが変わるだけ。Workflow・Logic・Storeには影響しない
- **.proto管理**：gRPC通信には `.proto` ファイルによるスキーマ定義が必要。`client/` 配下か専用の `proto/` フォルダで管理する

**対応方法**：`@slime/adapter-grpc` としてclient.tsの実装にgRPCトランスポートを提供するプラグイン化が現実的。

### tRPC → TypeScriptモノレポ向けオプションアダプター

tRPCはTypeScript専用のエンドツーエンド型安全APIライブラリ。コード生成なしでサーバーの型がクライアントへ直接流れる。

| 観点 | tRPC | gRPC |
|---|---|---|
| プロトコル | HTTP（POST/GET） | HTTP/2バイナリ |
| コード生成 | 不要（TS型推論） | .protoファイルが必要 |
| 対象 | TypeScript←→TypeScript | 言語横断のサービス間通信 |
| Parse層との相性 | Zodが共通で自然に統合できる | 別途バリデーション層が必要 |
| Workflowとのマッピング | procedure ≒ Workflow（ほぼ1:1） | serviceとmethodの階層 |

**Slimeとの相性**：tRPCの思想はSlimeと非常に親和性が高い。WorkflowをtRPC procedureとして公開するだけで、TypeScriptフロントエンドへの型安全なAPIが成立する。ZodはParse層と共通のため、Parse層のスキーマをtRPCのinputバリデーターとして再利用することも可能。

「フロントは外」方針との関係では、tRPCの本来の価値はモノレポで発揮されるためトレードオフがある：

| 選択 | 説明 |
|---|---|
| Option A（デフォルト） | REST + `slime export:openapi` でフロントを疎結合に消費 |
| Option tRPC | `@slime/adapter-trpc` でWorkflowをprocedureとして公開。TypeScriptモノレポ前提 |

### まとめ

| プロトコル | 対応方針 | Slime本体への影響 |
|---|---|---|
| REST（デフォルト） | 組み込み | ― |
| GraphQL | 前段ゲートウェイ方式 | なし（ゲートウェイ側が吸収） |
| gRPC | `@slime/adapter-grpc`（client.ts層） | なし（Lv8以降、外部サービス呼び出し用） |
| tRPC | `@slime/adapter-trpc`（オプション） | なし（モノレポ選択時のみ） |
