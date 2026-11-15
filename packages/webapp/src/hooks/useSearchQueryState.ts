import { debounce, parseAsString, useQueryState } from 'nuqs';
import { useCallback } from 'react';

const parseSearch = parseAsString.withDefault('').withOptions({ limitUrlUpdates: debounce(300) });

/** The `?search=` param. The value updates on every keystroke, the URL once typing pauses. A blank search removes the param. */
export function useSearchQueryState() {
    const [search, setSearch] = useQueryState('search', parseSearch);
    const updateSearch = useCallback(
        (value: string) => {
            void setSearch(value.trim() ? value : null);
        },
        [setSearch]
    );
    return [search, updateSearch] as const;
}
