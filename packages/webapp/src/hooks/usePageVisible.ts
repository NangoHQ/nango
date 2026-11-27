import { useEffect, useRef, useState } from 'react';

const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

/** `onReturn` never runs on mount, only when a hidden tab is shown again. */
export function usePageVisible(onReturn?: () => void): boolean {
    const [visible, setVisible] = useState(isVisible);
    const onReturnRef = useRef(onReturn);
    onReturnRef.current = onReturn;

    useEffect(() => {
        const onChange = () => {
            const next = isVisible();
            setVisible(next);
            if (next) {
                onReturnRef.current?.();
            }
        };
        document.addEventListener('visibilitychange', onChange);
        setVisible(isVisible());
        return () => document.removeEventListener('visibilitychange', onChange);
    }, []);

    return visible;
}
