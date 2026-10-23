/**
 * ドメイン間の依存宣言（Lv6以降）。
 * キーはドメインフォルダ名、値はそのドメインが依存してよいドメインフォルダ名の一覧。
 * 宣言にない向きの import と、宣言そのものの循環は Kaachan が Error として検出する。
 *
 * @example
 * const domains: DomainDependencies = {
 *   domainAuth: [],
 *   domainUser: ["domainAuth"],
 *   domainOrder: ["domainAuth", "domainUser"],
 * }
 */
export type DomainDependencies = Readonly<Record<string, readonly string[]>>
