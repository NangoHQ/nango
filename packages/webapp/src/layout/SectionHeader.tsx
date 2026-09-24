import { cn } from '@/utils/utils';

/**
 * Width a `centered` page caps its content at — the old 1280 cap plus the 228px (184px side panel +
 * 44px gap) the tabbed NavigationList used to take up. Shared with `DashboardLayout` so the header
 * row and the content below it can't drift apart.
 */
// A 14-inch MacBook Pro's content width: its 1512px viewport less the sidebar and the page padding.
export const CENTERED_MAX_WIDTH = 'max-w-[1240px]';

interface SectionHeaderProps {
    /** Section/page title shown on the left. */
    title: string;
    /** Optional content rendered inline right after the title (e.g. an environment badge). */
    badge?: React.ReactNode;
    /** Optional content rendered on the right of the row (e.g. the page's primary action). */
    actions?: React.ReactNode;
    /** Caps and centers the row to match a `centered` page's content. Set by `DashboardLayout`. */
    centered?: boolean;
}

/**
 * Section header — Figma node 1:5829. A fixed 56px row below the top bar showing the
 * current section title (with an optional inline badge) and the page's primary action on the right.
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, badge, actions, centered = false }) => (
    <div className="flex h-14 shrink-0 items-center border-b-[0.5px] border-border-default bg-surface-page px-6">
        <div className={cn('flex w-full items-center justify-between', centered && `mx-auto ${CENTERED_MAX_WIDTH}`)}>
            <div className="flex min-w-0 items-center gap-2.5">
                <h1 className="type-heading-sm truncate text-text-strong">{title}</h1>
                {badge}
            </div>
            {actions}
        </div>
    </div>
);
