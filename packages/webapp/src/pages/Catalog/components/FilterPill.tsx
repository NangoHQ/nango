import { cn } from '@/utils/utils';

export const FilterPill = ({
    label,
    icon,
    highlighted,
    count,
    selected,
    disabled,
    onClick
}: {
    label: string;
    icon?: React.ReactNode;
    highlighted?: boolean;
    count?: number;
    selected: boolean;
    disabled?: boolean;
    onClick: () => void;
}) => {
    return (
        <button
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'inline-flex items-center justify-center gap-1 rounded-full border-ds-hairline px-2 py-0.5',
                disabled ? 'cursor-not-allowed border-border-default bg-surface-panel text-text-disabled' : 'cursor-pointer',
                !disabled &&
                    (selected
                        ? 'bg-status-info-bg border-status-info-border text-status-info-text'
                        : cn('bg-surface-panel text-text-default hover:bg-state-hover', highlighted ? 'border-icon-brand' : 'border-border-default'))
            )}
        >
            {icon}
            <span className="text-ds-xs font-ds-medium leading-ds-normal">{label}</span>
            {count !== undefined && count > 0 && <span className="text-ds-2xs font-ds-regular tracking-ds-tight">{count}</span>}
        </button>
    );
};
