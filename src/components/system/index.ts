/**
 * Design system primitives — reusable, theme-aware UI building blocks.
 *
 * Rule of thumb: any pattern that appears on more than one page should live
 * here as a primitive, not be inlined per-page with `sx` props. Keeps the
 * newspaper aesthetic consistent and makes future re-skins one-file changes.
 */

export { default as PageHeader } from './PageHeader'
export type { PageHeaderProps } from './PageHeader'

export { default as SectionTitle } from './SectionTitle'
export type { SectionTitleProps } from './SectionTitle'

export { default as EmptyState } from './EmptyState'
export type { EmptyStateProps } from './EmptyState'

export { default as StatusChip, statusFromLatestActionType } from './StatusChip'
export type { StatusChipProps, StatusKind } from './StatusChip'

export { default as MetricTile } from './MetricTile'
export type { MetricTileProps } from './MetricTile'

export { default as ListCard, ItemRow } from './ListCard'
export type { ListCardProps, ItemRowProps } from './ListCard'
