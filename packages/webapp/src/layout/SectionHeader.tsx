import { cn } from '@/utils/utils';

interface SectionHeaderProps {
    /** Section/page title shown on the left. */
    title: string;
    /** Optional content rendered inline right after the title (e.g. an environment badge). */
    badge?: React.ReactNode;
    /** Optional content rendered on the right of the row (e.g. the page's primary action). */
    actions?: React.ReactNode;
    /** Extra classes for the row's inner container — pages cap it to their own content width so actions line up with it. */
    className?: string;
}

/**
 * Section header — Figma node 1:5829. A fixed 56px row below the top bar showing the
 * current section title (with an optional inline badge) and the page's primary action on the right.
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, badge, actions, className }) => (
    <div className="flex h-14 shrink-0 items-center border-b-[0.5px] border-border-default bg-surface-page px-6">
        <div className={cn('flex w-full items-center justify-between', className)}>
            <div className="flex min-w-0 items-center gap-2.5">
                <h1 className="type-heading-sm truncate text-text-strong">{title}</h1>
                {badge}
            </div>
            {actions}
        </div>
    </div>
);
