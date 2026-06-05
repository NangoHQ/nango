import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebounce } from 'react-use';

import { useSearchFilters } from '../../../hooks/useLogs';
import { useStore } from '../../../store';
import { FilterMultiSelect } from '@/components-v2/patterns/FilterMultiSelect';

export interface SearchableMultiSelectArgs<T> {
    label: string;
    category: T;
    selected: string[];
    max?: number;
    onChange: (selected: T[]) => void;
}

export const SearchableMultiSelect: React.FC<SearchableMultiSelectArgs<any>> = ({ label, category, selected, max, onChange }) => {
    const env = useStore((state) => state.env);

    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState<string | undefined>();
    useDebounce(() => setDebouncedSearch(search), 250, [search]);
    const { data, loading, trigger } = useSearchFilters(open, env, { category, search: debouncedSearch });

    const options = useMemo(() => {
        const all = [{ label: 'All', value: 'all' }];
        if (!data) return all;
        for (const item of data.data) {
            all.push({ label: item.key, value: item.key });
        }
        return all;
    }, [data]);

    useEffect(() => {
        if (open && !data) {
            trigger();
        }
        if (!open) {
            setSearch('');
        }
    }, [open, data]);

    const handleSearchChange = useCallback((value: string) => {
        setSearch(value);
    }, []);

    return (
        <FilterMultiSelect
            label={label}
            options={options}
            selected={selected}
            defaultSelect={['all']}
            onChange={onChange}
            showSearch
            onSearchChange={handleSearchChange}
            loading={loading}
            max={max}
            width="w-80"
            open={open}
            onOpenChange={setOpen}
        />
    );
};
