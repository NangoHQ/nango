import { CountBadge } from '@/components/ui/CountBadge';
import { cn } from '@/utils/utils';

import type { CategoryOption } from '../catalog.utils';

interface CategoryRailProps {
    categories: CategoryOption[];
    totalCount: number;
    selected: string | null;
    onSelect: (category: string | null) => void;
}

export const CategoryRail: React.FC<CategoryRailProps> = ({ categories, totalCount, selected, onSelect }) => (
    <nav
        aria-label="Categories"
        className="sticky top-0 flex h-[calc(100dvh-3.5rem)] w-(--sidebar-width) shrink-0 flex-col gap-4 self-start overflow-y-auto border-r-ds-hairline border-border-default bg-surface-canvas px-3 pt-4 pb-6"
    >
        <div className="border-b-ds-hairline border-border-default pb-3">
            <RailItem label="All APIs" count={totalCount} isSelected={selected === null} onClick={() => onSelect(null)} />
        </div>
        <div className="flex flex-col gap-0.5">
            <span className="px-2 pb-1 type-label-xs uppercase text-text-muted">Categories</span>
            {categories.map((category) => (
                <RailItem
                    key={category.slug}
                    label={category.label}
                    count={category.count}
                    isSelected={selected === category.slug}
                    onClick={() => onSelect(category.slug)}
                />
            ))}
        </div>
    </nav>
);

const RailItem: React.FC<{ label: string; count: number; isSelected: boolean; onClick: () => void }> = ({ label, count, isSelected, onClick }) => (
    <button
        type="button"
        aria-pressed={isSelected}
        onClick={onClick}
        className={cn(
            'group flex h-7 w-full cursor-pointer items-center justify-between gap-2 rounded-ds-sm px-2 text-left type-text-regular-sm transition-colors focus-default',
            isSelected ? 'bg-state-selected text-text-strong' : 'text-text-secondary hover:bg-state-hover hover:text-text-default'
        )}
    >
        <span className="truncate">{label}</span>
        <span className={cn(isSelected ? 'block' : 'hidden group-hover:block')}>
            <CountBadge count={count} tone="panel" />
        </span>
    </button>
);
