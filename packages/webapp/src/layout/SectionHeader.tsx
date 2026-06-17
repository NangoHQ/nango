interface SectionHeaderProps {
    /** Section/page title shown on the left. */
    title: string;
    /** Optional content rendered inline right after the title (e.g. an environment badge). */
    badge?: React.ReactNode;
}

/**
 * Section header — Figma node 1:5829. A fixed 56px row below the top bar showing the
 * current section title (with an optional inline badge). The right side is left blank for now.
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, badge }) => (
    <div className="flex h-14 shrink-0 items-center justify-between border-b-[0.5px] border-border-default bg-surface-page px-6">
        <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="type-heading-sm truncate text-text-strong">{title}</h1>
            {badge}
        </div>
    </div>
);
