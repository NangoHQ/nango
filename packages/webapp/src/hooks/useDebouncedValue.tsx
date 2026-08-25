import { useState } from 'react';
import { useDebounce } from 'react-use';

/** Returns a copy of `value` that updates `delayMs` after the latest change — useful for debouncing search inputs. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
    const [debounced, setDebounced] = useState(value);
    useDebounce(() => setDebounced(value), delayMs, [value]);
    return debounced;
}
