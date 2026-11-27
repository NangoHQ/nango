// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DOCKED_PANEL_MIN_WIDTH, DockedPanel, DockedPanelLayout, DockedPanelMain } from './docked-panel';

import type { Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
});

function renderPanel({ layoutWidth, panelWidth, storageKey }: { layoutWidth: number; panelWidth: number; storageKey?: string }) {
    act(() =>
        root.render(
            <DockedPanelLayout>
                <DockedPanelMain />
                <DockedPanel storageKey={storageKey}>content</DockedPanel>
            </DockedPanelLayout>
        )
    );
    const panel = container.querySelector('aside');
    const handle = container.querySelector<HTMLElement>('[role="separator"]');
    if (!panel?.parentElement || !handle) {
        throw new Error('DockedPanel did not render');
    }
    Object.defineProperty(panel.parentElement, 'clientWidth', { configurable: true, value: layoutWidth });
    Object.defineProperty(panel, 'offsetWidth', { configurable: true, value: panelWidth });
    return { panel, handle };
}

function press(el: HTMLElement, key: string) {
    act(() => {
        el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
}

describe('DockedPanel', () => {
    it('widens with ArrowLeft and narrows with ArrowRight', () => {
        const { panel, handle } = renderPanel({ layoutWidth: 1600, panelWidth: 600 });

        press(handle, 'ArrowLeft');
        expect(panel.style.width).toBe('616px');

        press(handle, 'ArrowRight');
        press(handle, 'ArrowRight');
        expect(panel.style.width).toBe('584px');
    });

    it('never shrinks below the minimum width', () => {
        const { panel, handle } = renderPanel({ layoutWidth: 1600, panelWidth: DOCKED_PANEL_MIN_WIDTH + 4 });

        press(handle, 'ArrowRight');
        expect(panel.style.width).toBe(`${DOCKED_PANEL_MIN_WIDTH}px`);
    });

    it('leaves room for the main column when docked', () => {
        const { panel, handle } = renderPanel({ layoutWidth: 1100, panelWidth: 676 });

        press(handle, 'ArrowLeft');
        expect(panel.style.width).toBe('680px');
    });

    it('leaves room for the layout padding and the gap between the cards', () => {
        const { panel, handle } = renderPanel({ layoutWidth: 1600, panelWidth: 1124 });
        Object.assign(panel.parentElement!.style, { paddingLeft: '20px', paddingRight: '20px', columnGap: '12px' });

        press(handle, 'ArrowLeft');
        expect(panel.style.width).toBe('1128px');
    });

    it('restores the stored width and resets it on double-click', () => {
        localStorage.setItem('panel-width', '700');
        const { panel, handle } = renderPanel({ layoutWidth: 1600, panelWidth: 700, storageKey: 'panel-width' });
        expect(panel.style.width).toBe('700px');

        press(handle, 'ArrowLeft');
        expect(localStorage.getItem('panel-width')).toBe('716');

        act(() => {
            handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        });
        expect(panel.style.width).toBe('');
        expect(localStorage.getItem('panel-width')).toBeNull();
    });
});
