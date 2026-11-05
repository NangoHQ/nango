// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Button, buttonVariants } from './button';

import type { Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Icon = () => <svg data-testid="icon" />;
const Label = ({ children }: { children: React.ReactNode }) => <span data-testid="label">{children}</span>;

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
    act(() => root.render(ui));
}

function query<T extends Element = Element>(selector: string): T {
    const element = container.querySelector<T>(selector);
    if (!element) {
        throw new Error(`No element matches ${selector}`);
    }
    return element;
}

const button = () => query<HTMLButtonElement>('button');
const spinner = () => container.querySelector('[data-spinner]');

describe('Button', () => {
    it('renders children untouched when loading is never passed', () => {
        render(
            <Button>
                <Icon />
                Save
            </Button>
        );
        expect(button().firstElementChild?.getAttribute('data-testid')).toBe('icon');
        expect(spinner()).toBeNull();
    });

    describe('loading', () => {
        it('keeps a text label in the accessibility tree and overlays the spinner', () => {
            render(<Button loading>Sign in</Button>);
            expect(button().textContent).toContain('Sign in');
            expect(container.querySelector('.invisible')).toBeNull();
            expect(spinner()).not.toBeNull();
            expect(button().disabled).toBe(true);
            expect(button().getAttribute('aria-busy')).toBe('true');
        });

        it('overlays the spinner on a leading icon instead of replacing it', () => {
            render(
                <Button loading>
                    <Icon />
                    Refresh
                </Button>
            );
            const icon = query('[data-testid="icon"]');
            expect(icon.parentElement?.contains(spinner())).toBe(true);
            expect(button().textContent).toContain('Refresh');
        });

        it('treats a component with children as a label, not a leading icon', () => {
            render(
                <Button loading>
                    <Label>Save</Label> (3)
                </Button>
            );
            const label = query('[data-testid="label"]');
            expect(label.textContent).toBe('Save');
            expect(label.parentElement?.contains(spinner())).toBe(false);
        });

        it('does not remount children when loading toggles', () => {
            const mounts = vi.fn();
            const Stateful = () => {
                useEffect(() => {
                    mounts();
                }, []);
                return <span>Save</span>;
            };
            for (const children of [<Stateful key="s" />, [<Icon key="i" />, <Stateful key="s" />]]) {
                mounts.mockClear();
                render(<Button loading={false}>{children}</Button>);
                render(<Button loading>{children}</Button>);
                render(<Button loading={false}>{children}</Button>);
                expect(mounts).toHaveBeenCalledTimes(1);
                render(null);
            }
        });
    });

    describe('asChild', () => {
        function clickLink() {
            const event = new MouseEvent('click', { bubbles: true, cancelable: true });
            act(() => {
                query('a').dispatchEvent(event);
            });
            return event;
        }

        it('blocks clicks on a disabled slotted link, including the child and caller capture handlers', () => {
            const onClick = vi.fn();
            const childCapture = vi.fn();
            const callerCapture = vi.fn();
            render(
                <Button asChild disabled onClickCapture={callerCapture}>
                    <a href="/x" onClick={onClick} onClickCapture={childCapture}>
                        Go
                    </a>
                </Button>
            );
            const event = clickLink();
            expect(event.defaultPrevented).toBe(true);
            expect(onClick).not.toHaveBeenCalled();
            expect(childCapture).not.toHaveBeenCalled();
            expect(callerCapture).not.toHaveBeenCalled();
        });

        it('runs the child and caller capture handlers when enabled', () => {
            const onClick = vi.fn((event: React.MouseEvent) => event.preventDefault());
            const childCapture = vi.fn();
            const callerCapture = vi.fn();
            render(
                <Button asChild onClickCapture={callerCapture}>
                    <a href="/x" onClick={onClick} onClickCapture={childCapture}>
                        Go
                    </a>
                </Button>
            );
            clickLink();
            expect(childCapture).toHaveBeenCalledTimes(1);
            expect(callerCapture).toHaveBeenCalledTimes(1);
            expect(onClick).toHaveBeenCalledTimes(1);
        });

        it('shows the spinner inside the slotted element while loading', () => {
            render(
                <Button asChild loading>
                    <a href="/x">Go</a>
                </Button>
            );
            const link = query('a');
            expect(container.firstElementChild).toBe(link);
            expect(link.contains(spinner())).toBe(true);
            expect(link.textContent).toContain('Go');
        });
    });

    it('resets the ghost background when disabled so hover does not fill it', () => {
        const classes = buttonVariants({ variant: 'ghost' }).split(' ');
        expect(classes).toContain('disabled:bg-interactive-ghost');
        expect(classes).toContain('aria-disabled:bg-interactive-ghost');
    });
});
