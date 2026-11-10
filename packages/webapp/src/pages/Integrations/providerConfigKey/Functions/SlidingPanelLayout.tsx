import { Fragment, useEffect, useState } from 'react';

import { cn } from '@/utils/utils';

const PANEL_TRANSITION_MS = 250;

interface SlidingPanelLayoutProps<T> {
    selected: T | null;
    getKey: (item: T) => string;
    renderPanel: (item: T) => React.ReactNode;
    children: React.ReactNode;
}

export function SlidingPanelLayout<T>({ selected, getKey, renderPanel, children }: SlidingPanelLayoutProps<T>) {
    const [displayed, setDisplayed] = useState(selected);
    const [panelVisible, setPanelVisible] = useState(Boolean(selected));

    useEffect(() => {
        let animationFrame: number | undefined;
        let closeTimer: ReturnType<typeof setTimeout> | undefined;

        if (selected) {
            setDisplayed(selected);
            animationFrame = requestAnimationFrame(() => {
                animationFrame = requestAnimationFrame(() => setPanelVisible(true));
            });
        } else {
            setPanelVisible(false);
            closeTimer = setTimeout(() => setDisplayed(null), PANEL_TRANSITION_MS);
        }

        return () => {
            if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
            if (closeTimer !== undefined) clearTimeout(closeTimer);
        };
    }, [selected]);

    return (
        <div className="flex w-full items-stretch overflow-clip">
            <div
                className={cn(
                    'min-w-0 shrink-0 transition-[width] duration-250 ease-out motion-reduce:transition-none',
                    panelVisible ? 'w-1/2' : 'w-full',
                    displayed && '**:data-[slot=table-container]:rounded-r-none [&>*]:rounded-r-none'
                )}
            >
                {children}
            </div>
            {displayed && (
                <div
                    className={cn(
                        'w-1/2 shrink-0 border-y border-r border-border-muted bg-surface-panel transition-[translate,opacity] duration-250 ease-out motion-reduce:transition-none',
                        panelVisible ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-full opacity-0'
                    )}
                >
                    <Fragment key={getKey(displayed)}>{renderPanel(displayed)}</Fragment>
                </div>
            )}
        </div>
    );
}
