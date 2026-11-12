import { cn } from '@/utils/utils';

interface SecondaryNavProps {
    label: string;
    children: React.ReactNode;
}

/** Pass it to `DashboardLayout`'s `secondaryNav`: rendered inside the page content, it would scroll away with it. */
export const SecondaryNav: React.FC<SecondaryNavProps> = ({ label, children }) => (
    <nav
        aria-label={label}
        className="flex w-55 shrink-0 flex-col gap-0.5 overflow-y-auto border-r-ds-hairline border-border-default bg-surface-page px-3 py-4"
    >
        {children}
    </nav>
);

export const SecondaryNavGroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="px-2 pt-3 pb-1 type-label-xs uppercase text-text-muted first:pt-0">{children}</span>
);

interface SecondaryNavItemProps {
    isSelected: boolean;
    onClick: () => void;
    /** The item filters the page instead of navigating, so screen readers announce it as pressed, not as the current page. */
    isFilter?: boolean;
    trailing?: React.ReactNode;
    children: React.ReactNode;
}

export const SecondaryNavItem: React.FC<SecondaryNavItemProps> = ({ isSelected, onClick, isFilter = false, trailing, children }) => (
    <button
        type="button"
        aria-current={isFilter ? undefined : isSelected || undefined}
        aria-pressed={isFilter ? isSelected : undefined}
        onClick={onClick}
        className={cn(
            'group flex h-7 w-full shrink-0 cursor-pointer items-center justify-between gap-2 rounded-ds-md px-2 text-left type-text-regular-sm transition-colors focus-default',
            isSelected ? 'bg-state-selected font-ds-medium text-text-strong' : 'text-text-secondary hover:bg-state-hover hover:text-text-default'
        )}
    >
        <span className="truncate">{children}</span>
        {trailing}
    </button>
);
