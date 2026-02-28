# Kaachan & Slime 設計ドキュメント

次世代WebアプリケーションFW構想 **Slime💧** および その静的解析ツール **Kaachan👩** に関する設計資料をまとめたリポジトリです。

## 概要

### Slime Architecture（アーキテクチャ進化論）

「最初から完成形を強制する」のではなく、**知らずに正しい設計へ段階的に誘導する**アーキテクチャ論。

Lv1（ルーティングのみ）からLv10（CQRS + 関数型クリーンアーキテクチャ）まで、コードが育つにつれて自然に制約が強まっていく多段階構造になっています。各Lvで設計理論（レイヤードアーキテクチャ・DDD・Ports & Adapters・CQRS等）が段階的に導入されます。

### Kaachan（👩 静的解析ツール / Linter）

コードがFatになってきたら **hint / warning / error** の3段階でがんがん指摘する静的解析ツール。ts-morphによるAST解析で型依存グラフを構築し、ドメイン候補を自動検出するなど、静的解析でできる限界まで踏み込む設計思想を持ちます。opinionatedに指摘しまくるのが母ちゃんたる所以。

### Slime（💧 Webアプリケーションフレームワーク）

Kaachanと連携してコマンドを提供するTS製のWebアプリケーションFW。コードのリファクタリング・スケーリング移行をサポートするマイグレーション機能が充実しているのが名前の由来。認証・2FA・べき等性キー・マルチテナンシーなど、ユーザーランド実装になりがちな機能を標準提供することも目指します。

---

## ドキュメント一覧

| ファイル | 内容 |
|---|---|
| [🤤 僕の考えた最強の次世代Webアプリケーションアーキテクチャ（進化論）.md](./🤤%20僕の考えた最強の次世代Webアプリケーションアーキテクチャ（進化論）.md) | Slime Architectureのメイン資料。Lv1〜Lv10の全体設計と各Lvの詳細 |
| [🤤 僕の考えた最強の次世代WebアプリケーションフレームワークMD（案）.md](./🤤%20僕の考えた最強の次世代Webアプリケーションフレームワーク（案）.md) | Kaachan・Slime FWの機能概要と設計方針 |
| [Kaachan設計仕様.md](./Kaachan設計仕様.md) | Kaachanの実装詳細（Fat Logic検出戦略・Fat Parse問題など） |
| [Slime FW詳細設計.md](./Slime%20FW詳細設計.md) | Slime FWの実装詳細（メトリクス自動計装・OTel連携など） |
| [Kaachan&Slime&Slime Architecture構想の設計根拠、補足資料.md](./Kaachan&Slime&Slime%20Architecture構想の設計根拠、補足資料.md) | 各LvのADR（設計理由の記録）・想定問答・補足資料 |

---

## 関連リンク
Qiitaで公開しています

- [🤤 僕の考えた最強の次世代Webアプリケーションフレームワーク（案）](https://qiita.com/u83unlimited/items/8b0e5b51749ccdfde393)
- [🤤 僕の考えた最強の次世代Webアプリケーションアーキテクチャ（進化論）](https://qiita.com/u83unlimited/items/86c9b0f5571e3e802ace)
- [👩 Kaachan &💧Slime &🏗️Slime Architecture構想の設計根拠、補足資料](https://qiita.com/u83unlimited/items/69a554c216d7b4bbc1b2)