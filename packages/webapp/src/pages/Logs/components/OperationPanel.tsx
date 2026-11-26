import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { CopyButton, DockedPanel } from '@nangohq/design-system';

import { TooltipIconButton } from '@/components/patterns/TooltipIconButton';
import { ShowOperation } from '../Operation/Show';

const PREVIOUS_LABEL = 'Previous operation (↑ or K)';
const NEXT_LABEL = 'Next operation (↓ or J)';

export const OperationPanel: React.FC<{ operationId: string; onClose: () => void; onPrevious?: () => void; onNext?: () => void }> = ({
    operationId,
    onClose,
    onPrevious,
    onNext
}) => {
    const location = useLocation();
    const link = `${window.location.origin}${location.pathname}${location.search}`;
    const contentRef = useRef<HTMLDivElement>(null);
    const pressedLabel = useRef<string | null>(null);

    // The header remounts with each operation. A pressed previous/next button gets focus back on its new copy.
    useEffect(() => {
        const label = pressedLabel.current;
        pressedLabel.current = null;
        const button = label ? contentRef.current?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]:not(:disabled)`) : null;
        (button ?? contentRef.current)?.focus({ preventScroll: true });
    }, [operationId]);

    const press = (label: string, action?: () => void) =>
        action &&
        (() => {
            pressedLabel.current = label;
            action();
        });

    // Escape in a nested sheet bubbles here through its React portal. The contains check keeps the panel open.
    const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Escape' && e.currentTarget.contains(e.target as Node)) {
            e.preventDefault();
            onClose();
        }
    };

    const actions = (
        <>
            <TooltipIconButton variant="ghost" size="sm" label={PREVIOUS_LABEL} onClick={press(PREVIOUS_LABEL, onPrevious)} disabled={!onPrevious}>
                <ChevronUp className="size-4" />
            </TooltipIconButton>
            <TooltipIconButton variant="ghost" size="sm" label={NEXT_LABEL} onClick={press(NEXT_LABEL, onNext)} disabled={!onNext}>
                <ChevronDown className="size-4" />
            </TooltipIconButton>
            <CopyButton value={link} size="sm" icon="link" label="Copy link" />
            <TooltipIconButton variant="ghost" size="sm" label="Close (Esc)" onClick={onClose}>
                <X />
            </TooltipIconButton>
        </>
    );

    return (
        <DockedPanel aria-label="Operation details" resizeLabel="Resize operation panel" storageKey="nango:logs:operation-panel-width" onKeyDown={onKeyDown}>
            <div ref={contentRef} tabIndex={-1} className="h-full min-h-0 overflow-y-auto select-text outline-none">
                <ShowOperation key={operationId} operationId={operationId} actions={actions} />
            </div>
        </DockedPanel>
    );
};
