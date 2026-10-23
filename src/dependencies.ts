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
