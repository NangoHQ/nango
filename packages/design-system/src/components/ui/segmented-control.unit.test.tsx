// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SegmentedControl, SegmentedControlItem } from './segmented-control';
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
});

function render(ui: React.ReactNode) {
    act(() => root.render(<TooltipProvider>{ui}</TooltipProvider>));
}

const items = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[data-slot="segmented-control-item"]'));
const item = (label: string) => {
    const found = items().find((el) => el.textContent === label || el.getAttribute('aria-label') === label);
    if (!found) {
        throw new Error(`No item ${label}`);
    }
    return found;
};
const selected = () => items().filter((el) => el.hasAttribute('data-selected'));

function click(el: HTMLElement) {
    act(() => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
}

const Control: React.FC<Partial<React.ComponentProps<typeof SegmentedControl>>> = (props) => (
    <SegmentedControl aria-label="Filter" {...props}>
        <SegmentedControlItem value="all">All</SegmentedControlItem>
        <SegmentedControlItem value="syncs">Syncs</SegmentedControlItem>
        <SegmentedControlItem value="actions" disabled>
            Actions
        </SegmentedControlItem>
    </SegmentedControl>
);

describe('SegmentedControl', () => {
    it('renders a named group of radios with the selected one marked', () => {
        render(<Control value="syncs" />);
        const group = container.querySelector('[role="group"]');
        expect(group?.getAttribute('aria-label')).toBe('Filter');
        expect(items().map((el) => el.getAttribute('role'))).toEqual(['radio', 'radio', 'radio']);
        expect(selected()).toEqual([item('Syncs')]);
        expect(item('Syncs').getAttribute('aria-checked')).toBe('true');
    });

    it('calls onValueChange with the clicked value', () => {
        const onValueChange = vi.fn();
        render(<Control value="all" onValueChange={onValueChange} />);
        click(item('Syncs'));
        expect(onValueChange).toHaveBeenCalledExactlyOnceWith('syncs');
    });

    it('never deselects: clicking the selected item does nothing', () => {
        const onValueChange = vi.fn();
        render(<Control defaultValue="all" onValueChange={onValueChange} />);
        click(item('All'));
        expect(onValueChange).not.toHaveBeenCalled();
        expect(selected()).toEqual([item('All')]);
    });

    it('keeps its own value when uncontrolled', () => {
        render(<Control defaultValue="all" />);
        click(item('Syncs'));
        expect(selected()).toEqual([item('Syncs')]);
    });

    it('selects the item that arrow keys move focus to', () => {
        const onValueChange = vi.fn();
        render(<Control value="all" onValueChange={onValueChange} />);
        act(() => {
            item('All').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
            item('Syncs').focus();
        });
        expect(onValueChange).toHaveBeenCalledExactlyOnceWith('syncs');
    });

    it('does not select on focus that came from elsewhere (Tab, click)', () => {
        const onValueChange = vi.fn();
        render(<Control value="all" onValueChange={onValueChange} />);
        act(() => item('Syncs').focus());
        expect(onValueChange).not.toHaveBeenCalled();
    });

    it('leaves Up/Down alone when horizontal', () => {
        const onValueChange = vi.fn();
        render(<Control value="all" orientation="horizontal" onValueChange={onValueChange} />);
        act(() => {
            item('All').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
            item('Syncs').focus();
        });
        expect(onValueChange).not.toHaveBeenCalled();
    });

    it('does not select a disabled item', () => {
        const onValueChange = vi.fn();
        render(<Control value="all" onValueChange={onValueChange} />);
        click(item('Actions'));
        expect(onValueChange).not.toHaveBeenCalled();
        expect(item('Actions').disabled).toBe(true);
    });

    it('sizes the track and items', () => {
        render(<Control size="sm" value="all" />);
        expect(container.querySelector('[role="group"]')?.className).toContain('h-7');
        expect(item('All').className).toContain('h-5.5');
    });

    it('makes icon-only items square and names them', () => {
        render(
            <SegmentedControl aria-label="Theme" value="light">
                <SegmentedControlItem value="light" aria-label="Light theme" icon={<svg />} />
                <SegmentedControlItem value="dark" aria-label="Dark theme" icon={<svg />} />
            </SegmentedControl>
        );
        expect(item('Light theme').className).toContain('w-6.5');
        expect(item('Light theme').className).toContain('px-0');
        expect(selected()).toEqual([item('Light theme')]);
    });

    it('requires an aria-label whenever an item would render icon-only', () => {
        // Type-level: empty children (null, false) fall into the icon-only branch, which needs a name.
        const unnamed = () => [
            // @ts-expect-error -- no children and no aria-label
            <SegmentedControlItem key="a" value="a" icon={<svg />} />,
            // @ts-expect-error -- null children render icon-only, so aria-label is required
            <SegmentedControlItem key="b" value="b" icon={<svg />}>
                {null}
            </SegmentedControlItem>
        ];
        expect(unnamed).toBeTypeOf('function');

        render(
            <SegmentedControl aria-label="Theme" value="light">
                <SegmentedControlItem value="light" aria-label="Light theme" icon={<svg />}>
                    {null}
                </SegmentedControlItem>
            </SegmentedControl>
        );
        expect(item('Light theme').getAttribute('aria-label')).toBe('Light theme');
        expect(item('Light theme').className).toContain('w-6.5');
    });
});
