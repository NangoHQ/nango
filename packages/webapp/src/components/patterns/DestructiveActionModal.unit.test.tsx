// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DestructiveActionModal } from './DestructiveActionModal';

import type { Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setNativeInputValue(input: HTMLInputElement, value: string) {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function getButtonByText(text: string): HTMLButtonElement {
    const found = Array.from(document.body.querySelectorAll('button')).find((btn) => btn.textContent?.includes(text));
    if (!found) {
        throw new Error(`Button "${text}" not found`);
    }
    return found;
}

describe('DestructiveActionModal', () => {
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
        document.body.innerHTML = '';
    });

    it('shows pending state, disables dismissal, and prevents duplicate confirm submissions while async onConfirm is running', async () => {
        let resolveConfirm!: () => void;
        const onConfirm = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveConfirm = resolve;
                })
        );
        const onOpenChange = vi.fn();

        act(() => {
            root.render(
                <DestructiveActionModal
                    title="Proceed carefully!"
                    description="Irreversible action."
                    confirmationKeyword="old-dev"
                    confirmButtonText="Delete Environment"
                    onConfirm={onConfirm}
                    open
                    onOpenChange={onOpenChange}
                />
            );
        });

        const input = document.body.querySelector('input[name="confirmation"]') as HTMLInputElement;
        const confirmBtn = getButtonByText('Delete Environment');
        const cancelBtn = getButtonByText('Cancel');

        expect(confirmBtn.disabled).toBe(true);

        act(() => {
            setNativeInputValue(input, 'old-dev');
        });
        expect(confirmBtn.disabled).toBe(false);

        const form = document.body.querySelector('form');
        if (!form) {
            throw new Error('Form not found');
        }
        act(() => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(confirmBtn.getAttribute('aria-busy')).toBe('true');
        expect(confirmBtn.disabled).toBe(true);
        expect(cancelBtn.disabled).toBe(true);
        expect(input.disabled).toBe(true);

        act(() => {
            cancelBtn.click();
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        expect(onOpenChange).not.toHaveBeenCalled();

        await act(async () => {
            resolveConfirm();
            await Promise.resolve();
        });

        expect(confirmBtn.getAttribute('aria-busy')).toBeNull();
        expect(confirmBtn.disabled).toBe(false);
        expect(cancelBtn.disabled).toBe(false);
        expect(input.disabled).toBe(false);
    });

    it('resets pending state and preserves typed confirmation text when onConfirm rejects', async () => {
        const onConfirm = vi.fn(() => Promise.reject(new Error('Request failed')));
        const onOpenChange = vi.fn();

        act(() => {
            root.render(
                <DestructiveActionModal
                    title="Proceed carefully!"
                    description="Irreversible action."
                    confirmationKeyword="old-dev"
                    confirmButtonText="Delete Environment"
                    onConfirm={onConfirm}
                    open
                    onOpenChange={onOpenChange}
                />
            );
        });

        const input = document.body.querySelector('input[name="confirmation"]') as HTMLInputElement;
        const confirmBtn = getButtonByText('Delete Environment');

        act(() => {
            setNativeInputValue(input, 'old-dev');
        });

        await act(async () => {
            confirmBtn.click();
            await Promise.resolve();
        });

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onOpenChange).not.toHaveBeenCalled();
        expect(input.value).toBe('old-dev');
        expect(confirmBtn.getAttribute('aria-busy')).toBeNull();
        expect(confirmBtn.disabled).toBe(false);
    });
});
