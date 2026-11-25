import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { CopyButton, DockedPanel, IconButton } from '@nangohq/design-system';

import { ShowOperation } from '../Operation/Show';

export const OperationPanel: React.FC<{ operationId: string; onClose: () => void }> = ({ operationId, onClose }) => {
    const location = useLocation();
    const link = `${window.location.origin}${location.pathname}${location.search}`;
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        contentRef.current?.focus({ preventScroll: true });
    }, [operationId]);

    // Escape in a nested sheet bubbles here through its React portal. The contains check keeps the panel open.
    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape' && e.currentTarget.contains(e.target as Node)) {
            e.preventDefault();
            onClose();
        }
    };

    return (
        <DockedPanel aria-label="Operation details" resizeLabel="Resize operation panel" storageKey="nango:logs:operation-panel-width">
            <div ref={contentRef} tabIndex={-1} onKeyDown={onKeyDown} className="relative h-full min-h-0 overflow-y-auto select-text outline-none">
                <div className="absolute right-6 top-[35px] flex items-center gap-1">
                    <CopyButton value={link} size="sm" label="Copy link" />
                    <IconButton variant="ghost" size="sm" label="Close" onClick={onClose}>
                        <X />
                    </IconButton>
                </div>
                <ShowOperation key={operationId} operationId={operationId} />
            </div>
        </DockedPanel>
    );
};
