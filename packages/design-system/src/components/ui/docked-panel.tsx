import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '../../lib/cn';

export const DOCKED_PANEL_MIN_WIDTH = 480;
const MAIN_MIN_WIDTH = 420;
const KEYBOARD_STEP = 16;

const card = 'overflow-hidden rounded-t-ds-md border-ds-1 border-b-0 border-border-default bg-surface-panel';

export const DockedPanelLayout = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn('relative flex h-full min-h-0 w-full gap-3 px-5', className)} {...props} />
));
DockedPanelLayout.displayName = 'DockedPanelLayout';

export const DockedPanelMain = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex min-h-0 min-w-0 flex-1 flex-col', card, className)} {...props} />
));
DockedPanelMain.displayName = 'DockedPanelMain';

function readStoredWidth(storageKey: string | undefined): number | null {
    if (!storageKey) {
        return null;
    }
    try {
        const stored = Number(localStorage.getItem(storageKey));
        return Number.isFinite(stored) && stored >= DOCKED_PANEL_MIN_WIDTH ? stored : null;
    } catch {
        return null;
    }
}

function writeStoredWidth(storageKey: string, width: number | null) {
    try {
        if (width === null) {
            localStorage.removeItem(storageKey);
        } else {
            localStorage.setItem(storageKey, String(width));
        }
    } catch {
        return;
    }
}

function getMaxWidth(panel: HTMLElement): number | null {
    const layout = panel.parentElement;
    if (!layout?.clientWidth) {
        return null;
    }
    const layoutStyle = getComputedStyle(layout);
    const contentWidth = layout.clientWidth - (parseFloat(layoutStyle.paddingLeft) || 0) - (parseFloat(layoutStyle.paddingRight) || 0);
    const isOverlay = getComputedStyle(panel).position === 'absolute';
    return Math.max(DOCKED_PANEL_MIN_WIDTH, contentWidth - (isOverlay ? 0 : MAIN_MIN_WIDTH + (parseFloat(layoutStyle.columnGap) || 0)));
}

export interface DockedPanelProps extends React.HTMLAttributes<HTMLElement> {
    resizeLabel?: string;
    storageKey?: string;
}

export const DockedPanel = forwardRef<HTMLElement, DockedPanelProps>(
    ({ className, style, resizeLabel = 'Resize panel', storageKey, children, ...props }, ref) => {
        const panelRef = useRef<HTMLElement | null>(null);
        const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
        const [width, setWidth] = useState<number | null>(() => readStoredWidth(storageKey));
        const [dragging, setDragging] = useState(false);
        const [bounds, setBounds] = useState<{ now: number; max: number } | null>(null);

        useEffect(() => {
            if (storageKey) {
                writeStoredWidth(storageKey, width);
            }
        }, [storageKey, width]);

        const setRefs = useCallback(
            (node: HTMLElement | null) => {
                panelRef.current = node;
                if (typeof ref === 'function') {
                    ref(node);
                } else if (ref) {
                    ref.current = node;
                }
            },
            [ref]
        );

        useEffect(() => {
            const panel = panelRef.current;
            const layout = panel?.parentElement;
            if (!panel || !layout || typeof ResizeObserver === 'undefined') {
                return;
            }
            const observer = new ResizeObserver(() => {
                setBounds({ now: panel.offsetWidth, max: getMaxWidth(panel) ?? panel.offsetWidth });
            });
            observer.observe(panel);
            observer.observe(layout);
            return () => observer.disconnect();
        }, []);

        const clamp = (next: number) => {
            const max = panelRef.current ? getMaxWidth(panelRef.current) : null;
            const atLeastMin = Math.max(DOCKED_PANEL_MIN_WIDTH, next);
            return max === null ? atLeastMin : Math.min(max, atLeastMin);
        };

        const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
            if (e.button !== 0 || !panelRef.current) {
                return;
            }
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = { startX: e.clientX, startWidth: panelRef.current.offsetWidth };
            setDragging(true);
        };

        const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
            const drag = dragRef.current;
            if (!drag) {
                return;
            }
            setWidth(clamp(drag.startWidth + drag.startX - e.clientX));
        };

        const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
            if (!dragRef.current) {
                return;
            }
            dragRef.current = null;
            setDragging(false);
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
        };

        const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
                return;
            }
            e.preventDefault();
            const current = panelRef.current?.offsetWidth ?? width ?? DOCKED_PANEL_MIN_WIDTH;
            setWidth(clamp(current + (e.key === 'ArrowLeft' ? KEYBOARD_STEP : -KEYBOARD_STEP)));
        };

        return (
            <aside
                ref={setRefs}
                className={cn(
                    'relative flex h-full min-h-0 w-[clamp(600px,48%,960px)] flex-none flex-col',
                    card,
                    'overflow-visible',
                    'min-[1180px]:max-w-[calc(100%-432px)]',
                    'max-[1180px]:absolute max-[1180px]:inset-y-0 max-[1180px]:right-5 max-[1180px]:z-10 max-[1180px]:max-w-[calc(100%-40px)] max-[1180px]:shadow-container-sheet',
                    className
                )}
                style={width === null ? style : { ...style, width }}
                {...props}
            >
                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={resizeLabel}
                    aria-valuemin={DOCKED_PANEL_MIN_WIDTH}
                    aria-valuemax={bounds?.max}
                    aria-valuenow={bounds?.now}
                    tabIndex={0}
                    data-dragging={dragging || undefined}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onKeyDown={onKeyDown}
                    onDoubleClick={() => setWidth(null)}
                    className={cn(
                        'absolute inset-y-0 -left-2.25 z-20 w-1.5 cursor-col-resize touch-none',
                        'transition-[background-color,box-shadow] duration-100 ease-in-out',
                        'hover:bg-border-strong data-[dragging]:bg-border-strong',
                        'focus-visible:outline-none focus-visible:shadow-focus-outline-default'
                    )}
                />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[inherit]">{children}</div>
            </aside>
        );
    }
);
DockedPanel.displayName = 'DockedPanel';
