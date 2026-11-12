// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CopyButton } from './copy-button';
import { Field, FieldDescription, FieldError, FieldLabel } from './field';
import { Input } from './input';
import { InputGroup, InputGroupInput } from './input-group';
import { SearchInput, setNativeValue } from './search-input';
import { maskSecret, SecretInput } from './secret-input';
import { Textarea } from './textarea';
import { TooltipProvider } from './tooltip';

import type { Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// The open "Copied" tooltip measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
};

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
    vi.useRealTimers();
});

function render(ui: React.ReactNode) {
    act(() => root.render(<TooltipProvider>{ui}</TooltipProvider>));
}

function $<T extends Element = HTMLElement>(selector: string): T {
    const el = container.querySelector<T>(selector);
    if (!el) {
        throw new Error(`No element matches ${selector}`);
    }
    return el;
}

function type(input: HTMLInputElement, value: string) {
    act(() => setNativeValue(input, value));
}

function key(target: EventTarget, k: string) {
    act(() => {
        target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    });
}

describe('Field wiring', () => {
    it('links label, description, error and invalid state to the control', () => {
        render(
            <Field data-invalid>
                <FieldLabel>Name</FieldLabel>
                <Input defaultValue="Dev Env" />
                <FieldDescription>Lowercase.</FieldDescription>
                <FieldError>Use 1–32 lowercase letters, numbers or hyphens.</FieldError>
            </Field>
        );
        const label = $<HTMLLabelElement>('label');
        const input = $<HTMLInputElement>('input');
        expect(label.htmlFor).toBe(input.id);
        expect(input.getAttribute('aria-invalid')).toBe('true');
        const described = (input.getAttribute('aria-describedby') ?? '').split(' ');
        expect(described.map((id) => document.getElementById(id)?.textContent)).toEqual(['Lowercase.', 'Use 1–32 lowercase letters, numbers or hyphens.']);
    });

    it('lets explicit props win (react-hook-form Form wires its own ids)', () => {
        render(
            <Field>
                <FieldLabel htmlFor="own">Name</FieldLabel>
                <Input id="own" aria-describedby="own-desc" aria-invalid={false} />
                <FieldDescription id="own-desc">Hint</FieldDescription>
            </Field>
        );
        const input = $<HTMLInputElement>('input');
        expect(input.id).toBe('own');
        expect(input.getAttribute('aria-describedby')).toBe('own-desc');
        expect(input.getAttribute('aria-invalid')).toBe('false');
    });

    it('gives the Field id to the first control only', () => {
        render(
            <Field>
                <FieldLabel>Range</FieldLabel>
                <InputGroup>
                    <InputGroupInput />
                </InputGroup>
                <Input />
            </Field>
        );
        const ids = Array.from(container.querySelectorAll('input')).map((input) => input.id);
        expect(ids[0]).toBeTruthy();
        expect(ids[1]).toBe('');
    });

    it('points the label at an explicit control id', () => {
        render(
            <Field>
                <FieldLabel>Name</FieldLabel>
                <Input id="own" />
            </Field>
        );
        expect($<HTMLLabelElement>('label').htmlFor).toBe('own');
    });

    it('hands the Field id to a control that replaces the first one', () => {
        const ui = (k: string) => (
            <Field>
                <FieldLabel>Name</FieldLabel>
                <Input key={k} />
            </Field>
        );
        render(ui('a'));
        render(ui('b'));
        const input = $<HTMLInputElement>('input');
        expect(input.id).toBeTruthy();
        expect($<HTMLLabelElement>('label').htmlFor).toBe(input.id);
    });

    it('wires a Textarea too', () => {
        render(
            <Field data-invalid>
                <FieldLabel>Notes</FieldLabel>
                <Textarea />
                <FieldError>Required.</FieldError>
            </Field>
        );
        const textarea = $<HTMLTextAreaElement>('textarea');
        expect($<HTMLLabelElement>('label').htmlFor).toBe(textarea.id);
        expect(textarea.getAttribute('aria-invalid')).toBe('true');
        expect(textarea.getAttribute('aria-describedby')).toBeTruthy();
    });

    it('renders the optional tag and no error when empty', () => {
        render(
            <Field>
                <FieldLabel optional>Secondary URL</FieldLabel>
                <Input />
                <FieldError />
            </Field>
        );
        expect($('label').textContent).toBe('Secondary URLOptional');
        expect(container.querySelector('[data-slot=field-error]')).toBeNull();
        expect($('input').hasAttribute('aria-describedby')).toBe(false);
    });
});

describe('className overrides', () => {
    it('lets a caller font utility win over the default typography', () => {
        render(
            <>
                <Input className="font-mono" />
                <InputGroup>
                    <InputGroupInput className="font-mono" />
                </InputGroup>
            </>
        );
        for (const input of Array.from(container.querySelectorAll('input'))) {
            expect(input.className).toContain('font-mono');
            expect(input.className).not.toContain('font-sans');
        }
    });
});

describe('SecretInput', () => {
    const secret = 'nango_sk_dev_abcdef4c9';

    it('masks all but the last 3 characters with a fixed-length mask', () => {
        expect(maskSecret(secret)).toBe('•'.repeat(20) + '4c9');
        expect(maskSecret('ab')).toBe('•'.repeat(20));
    });

    it('reveals and hides', () => {
        render(<SecretInput value={secret} aria-label="Secret key" />);
        const input = $<HTMLInputElement>('input');
        expect(input.readOnly).toBe(true);
        expect(input.value).toBe(maskSecret(secret));
        const reveal = $<HTMLButtonElement>('button[aria-label="Show secret"]');
        act(() => reveal.click());
        expect(input.value).toBe(secret);
        expect($('button[aria-label="Hide secret"]').getAttribute('aria-pressed')).toBe('true');
    });

    it('hides reveal and copy without access', () => {
        render(<SecretInput value={secret} canReveal={false} aria-label="Secret key" />);
        expect(container.querySelectorAll('button')).toHaveLength(0);
        expect($<HTMLInputElement>('input').value).toBe(maskSecret(secret));
    });
});

describe('CopyButton', () => {
    it('copies and shows Copied for ~1.5s', async () => {
        vi.useFakeTimers();
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText } });
        render(<CopyButton text="a0583184" />);
        const button = $<HTMLButtonElement>('button');
        expect(button.getAttribute('aria-label')).toBe('Copy');
        await act(async () => {
            button.click();
            await Promise.resolve();
        });
        expect(writeText).toHaveBeenCalledWith('a0583184');
        expect(button.getAttribute('aria-label')).toBe('Copied');
        act(() => {
            vi.advanceTimersByTime(1500);
        });
        expect(button.getAttribute('aria-label')).toBe('Copy');
    });

    it('restarts the Copied timer on every copy', async () => {
        vi.useFakeTimers();
        Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
        render(<CopyButton text="a0583184" />);
        const button = $<HTMLButtonElement>('button');
        const click = () =>
            act(async () => {
                button.click();
                await Promise.resolve();
            });
        await click();
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        await click();
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(button.getAttribute('aria-label')).toBe('Copied');
    });
});

describe('SearchInput', () => {
    function Controlled() {
        const [value, setValue] = useState('');
        return <SearchInput value={value} onValueChange={setValue} placeholder="Filter scopes" />;
    }

    it('focuses on "/" and swaps the hint for Clear once there is a value', () => {
        render(<Controlled />);
        const input = $<HTMLInputElement>('input');
        expect($('kbd').textContent).toBe('/');
        key(document.body, '/');
        expect(document.activeElement).toBe(input);

        type(input, 'read');
        expect(container.querySelector('kbd')).toBeNull();
        act(() => $<HTMLButtonElement>('button[aria-label="Clear search"]').click());
        expect(input.value).toBe('');
        expect(container.querySelector('kbd')).not.toBeNull();
    });

    it('ignores "/" while typing in another field', () => {
        render(
            <>
                <input data-testid="other" />
                <SearchInput />
            </>
        );
        const other = $<HTMLInputElement>('[data-testid=other]');
        act(() => other.focus());
        key(other, '/');
        expect(document.activeElement).toBe(other);
    });

    it('clears on Esc (uncontrolled)', () => {
        const onValueChange = vi.fn();
        render(<SearchInput defaultValue="read" onValueChange={onValueChange} />);
        const input = $<HTMLInputElement>('input');
        key(input, 'Escape');
        expect(input.value).toBe('');
        expect(onValueChange).toHaveBeenLastCalledWith('');
    });
});
