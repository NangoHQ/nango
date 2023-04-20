import { useState, useRef, useCallback } from 'react';

export default function useSet<T>(initialValue?: T[], limit?: number) {
    const [_, setInc] = useState(false);

    const set = useRef(new Set<T>(initialValue));

    const add = useCallback(
        (item: T) => {
            if (set.current.has(item) || (limit && Array.from(set.current.values()).length >= limit)) return;
            setInc((prev) => !prev);
            set.current.add(item);
        },
        [setInc]
    );

    const remove = useCallback(
        (item: T) => {
            if (!set.current.has(item)) return;
            setInc((prev) => !prev);
            set.current.delete(item);
        },
        [setInc]
    );

    return [set.current, add, remove] as const;
}
