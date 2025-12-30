import { useCallback, useRef, useState } from 'react';

import { ConfirmDialog } from '@/components-v2/ConfirmDialog';

import type { ConfirmDialogOptions } from '@/components-v2/ConfirmDialog';

export const useConfirmDialog = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
    const resolveRef = useRef<((value: boolean) => void) | null>(null);

    const confirm = useCallback((dialogOptions: ConfirmDialogOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            resolveRef.current = resolve;
            setOptions(dialogOptions);
            setIsOpen(true);
        });
    }, []);

    const handleConfirm = useCallback(async () => {
        if (options && resolveRef.current) {
            try {
                await options.onConfirm();
                resolveRef.current(true);
            } catch (err) {
                // Error handling is expected to be done in onConfirm
                void err;
                resolveRef.current(false);
            } finally {
                setIsOpen(false);
                setOptions(null);
                resolveRef.current = null;
            }
        }
    }, [options]);

    const handleOpenChange = useCallback((open: boolean) => {
        setIsOpen(open);
        if (!open && resolveRef.current) {
            // Dialog was closed without confirming (e.g., clicking outside or pressing ESC)
            resolveRef.current(false);
            resolveRef.current = null;
            setOptions(null);
        }
    }, []);

    const DialogComponent = options ? <ConfirmDialog open={isOpen} onOpenChange={handleOpenChange} {...options} onConfirm={handleConfirm} /> : null;

    return {
        confirm,
        DialogComponent
    };
};
