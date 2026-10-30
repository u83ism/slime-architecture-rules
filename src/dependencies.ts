/**
 * ドメイン間の依存宣言（Lv6以降）。
 * キーは domains/ 直下のフォルダ名、値はそのドメインが依存してよいドメインのフォルダ名の一覧。
 * 宣言にない向きの import と、宣言そのものの循環は Kaachan が Error として検出する。
 *
 * @example
 * const domains: DomainDependencies = {
 *   auth: [],
 *   user: ["auth"],
 *   order: ["auth", "user"],
 * }
 */
export type DomainDependencies = Readonly<Record<string, readonly string[]>>

/**
 * テーブルの所有宣言（Lv6以降）。
 * キーは domains/ 直下のフォルダ名、値はそのドメインが所有するテーブル（コード上に現れる ORM のモデル名）の一覧。
 * 書き込みは所有ドメインの store からだけ行い、読み取りも所有ドメインの関数を経由する（Lv10 の読み取り側アダプターは越境 JOIN 可）。
 * 同じテーブルを複数ドメインが宣言すると Kaachan が Error として検出する。宣言のないテーブルは shared/store.ts から扱う。
 *
 * @example
 * const tables: TableOwnership = {
 *   auth: ["session"],
 *   user: ["user", "userProfile"],
 *   order: ["order", "orderItem"],
 * }
 */
export type TableOwnership = Readonly<Record<string, readonly string[]>>
