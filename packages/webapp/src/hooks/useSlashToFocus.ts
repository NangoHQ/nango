import { useEffect } from 'react';

import type { RefObject } from 'react';

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Focuses the given input when "/" is pressed outside of a text field. */
export function useSlashToFocus(inputRef: RefObject<HTMLInputElement | null>) {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) {
                return;
            }
            event.preventDefault();
            inputRef.current?.focus();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [inputRef]);
}
