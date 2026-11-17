// @vitest-environment jsdom
import { Slot } from '@radix-ui/react-slot';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Field, FieldDescription, FieldError, FieldLabel } from './field';
import { Input } from './input';
import { InputGroup, InputGroupInput } from './input-group';
import { Textarea } from './textarea';
import { TooltipProvider } from './tooltip';

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

    it('marks only the first control invalid', () => {
        render(
            <Field data-invalid>
                <FieldLabel>Headers</FieldLabel>
                <Input />
                <Input />
                <FieldError>Row 2 is missing a value.</FieldError>
            </Field>
        );
        const [first, second] = Array.from(container.querySelectorAll('input'));
        expect(first?.getAttribute('aria-invalid')).toBe('true');
        expect(first?.getAttribute('aria-describedby')).toBeTruthy();
        expect(second?.hasAttribute('aria-invalid')).toBe(false);
        expect(second?.hasAttribute('aria-describedby')).toBe(false);
    });

    it('leaves the label unlinked without a design-system control', () => {
        render(
            <Field>
                <FieldLabel>Role</FieldLabel>
                <select />
            </Field>
        );
        expect($<HTMLLabelElement>('label').hasAttribute('for')).toBe(false);
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

describe('InputGroupInput under a Slot', () => {
    it('keeps its data-slot when a wrapper passes another one', () => {
        render(
            <InputGroup>
                <Slot data-slot="form-control" aria-invalid>
                    <InputGroupInput />
                </Slot>
            </InputGroup>
        );
        expect($('input').getAttribute('data-slot')).toBe('input-group-control');
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
