interface PageHeaderProps {
    title: React.ReactNode;
    /** Rendered before the title, e.g. an integration logo. */
    leading?: React.ReactNode;
    /** The page's primary action, on the right. */
    actions?: React.ReactNode;
}

/**
 * The 64px row under the top bar for pages about one entity (Dharma: Page header).
 * Every other page relies on the breadcrumb for its title and puts its actions in the top bar.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, leading, actions }) => (
    <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-b-[0.5px] border-border-default bg-surface-page px-6">
        <div className="flex min-w-0 items-center gap-2">
            {leading}
            <h2 className="type-heading-sm truncate text-text-strong">{title}</h2>
        </div>
        {actions}
    </div>
);
