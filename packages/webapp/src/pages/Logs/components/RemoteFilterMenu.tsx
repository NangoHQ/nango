import { useMemo, useState } from 'react';

import { FilterMenu } from '@/components/ui/FilterMenu';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useSearchFilters } from '../../../hooks/useLogs';
import { useStore } from '../../../store';

import type { FilterMenuProps } from '@/components/ui/FilterMenu';
import type { SearchFiltersCategory } from '@nangohq/types';

const MAX_VALUES = 20;
// The `limit` in the server's searchFilters controller; it returns no more than this and doesn't page.
const SERVER_OPTIONS_LIMIT = 20;

export const toggled = <T extends string>(selected: T[], value: T): T[] =>
    selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];

export type RemoteFilterMenuProps = Pick<FilterMenuProps, 'trigger' | 'anchor' | 'open' | 'onOpenChange' | 'side' | 'focusSearchOnOpen' | 'onBack'> & {
    label: string;
    category: SearchFiltersCategory;
    selected: string[];
    onChange: (selected: string[]) => void;
};

export const RemoteFilterMenu: React.FC<RemoteFilterMenuProps> = ({ label, category, selected, onChange, open, ...menuProps }) => {
    const env = useStore((state) => state.env);
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search.trim(), 250);
    const { data, loading, isError, refetch } = useSearchFilters(open, env, { category, search: debouncedSearch || undefined });
    const searchPending = search.trim() !== debouncedSearch;
    const capped = !debouncedSearch && (data?.data.length ?? 0) >= SERVER_OPTIONS_LIMIT;

    // Selected values stay listed when the server's first page leaves them out, so they can be unticked.
    const options = useMemo(() => {
        const keys = data?.data.map((item) => item.key) ?? [];
        const missing = debouncedSearch ? [] : selected.filter((value) => !keys.includes(value));
        return [...missing, ...keys].map((key) => ({ value: key, label: key, mono: category !== 'integration' }));
    }, [data, selected, debouncedSearch, category]);

    return (
        <FilterMenu
            {...menuProps}
            label={label}
            open={open}
            options={options}
            selected={selected}
            onToggle={(value) => onChange(toggled(selected, value))}
            onClear={() => onChange([])}
            searchable
            searchPlaceholder={`Search ${label.toLowerCase()}s…`}
            onSearchChange={setSearch}
            loading={loading || searchPending}
            error={isError}
            onRetry={() => void refetch()}
            note={capped ? `Showing the first ${SERVER_OPTIONS_LIMIT}. Search to find others.` : undefined}
            max={MAX_VALUES}
        />
    );
};
