// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePageVisible } from './usePageVisible';

import type { Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
let visibility: DocumentVisibilityState = 'visible';

function setVisibility(next: DocumentVisibilityState) {
    visibility = next;
    act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
    });
}

function Probe({ onReturn }: { onReturn: () => void }) {
    const visible = usePageVisible(onReturn);
    return <p>{visible ? 'visible' : 'hidden'}</p>;
}

beforeEach(() => {
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    container = document.createElement('div');
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    vi.restoreAllMocks();
});

describe('usePageVisible', () => {
    it('follows the tab and calls onReturn only when it comes back', () => {
        const onReturn = vi.fn();
        act(() => root.render(<Probe onReturn={onReturn} />));
        expect(container.textContent).toBe('visible');
        expect(onReturn).not.toHaveBeenCalled();

        setVisibility('hidden');
        expect(container.textContent).toBe('hidden');
        expect(onReturn).not.toHaveBeenCalled();

        setVisibility('visible');
        expect(container.textContent).toBe('visible');
        expect(onReturn).toHaveBeenCalledTimes(1);
    });
});
