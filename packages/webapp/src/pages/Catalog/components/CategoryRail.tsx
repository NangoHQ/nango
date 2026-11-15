import { CountBadge } from '@/components/ui/CountBadge';
import { SecondaryNav, SecondaryNavGroupLabel, SecondaryNavItem } from '@/layout/SecondaryNav';
import { cn } from '@/utils/utils';

import type { CategoryOption } from '../catalog.utils';

interface CategoryRailProps {
    categories: CategoryOption[];
    totalCount: number;
    selected: string | null;
    onSelect: (category: string | null) => void;
}

export const CategoryRail: React.FC<CategoryRailProps> = ({ categories, totalCount, selected, onSelect }) => (
    <SecondaryNav label="Categories">
        <div className="border-b-ds-hairline border-border-default pb-3">
            <RailItem label="All APIs" count={totalCount} isSelected={selected === null} onClick={() => onSelect(null)} />
        </div>
        <SecondaryNavGroupLabel>Categories</SecondaryNavGroupLabel>
        {categories.map((category) => (
            <RailItem
                key={category.slug}
                label={category.label}
                count={category.count}
                isSelected={selected === category.slug}
                onClick={() => onSelect(category.slug)}
            />
        ))}
    </SecondaryNav>
);

const RailItem: React.FC<{ label: string; count: number; isSelected: boolean; onClick: () => void }> = ({ label, count, isSelected, onClick }) => (
    <SecondaryNavItem
        isFilter
        isSelected={isSelected}
        onClick={onClick}
        trailing={
            <span className={cn(isSelected ? 'block' : 'hidden group-hover:block')}>
                <CountBadge count={count} tone="panel" />
            </span>
        }
    >
        {label}
    </SecondaryNavItem>
);
