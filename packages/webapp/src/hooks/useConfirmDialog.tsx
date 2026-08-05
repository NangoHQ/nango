import { useCallback, useRef, useState } from 'react';

import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Button
} from '@nangohq/design-system';

import { StyledLink } from '@/components/ui/StyledLink';

import type { ReactNode } from 'react';

export interface ConfirmDialogOptions {
    title: string;
    description: string;
    confirmButtonText?: string;
    cancelButtonText?: string;
    confirmVariant?: 'primary' | 'danger' | 'secondary' | 'outline';
    /** Rendered inside the header media box (Figma AlertDialog leads with an icon). */
    icon?: ReactNode;
    docs?: {
        title: string;
        url: string;
    };
    onConfirm: () => unknown;
}

export const useConfirmDialog = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
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
        if (!options || !resolveRef.current) {
            return;
        }
        setIsLoading(true);
        try {
            await options.onConfirm();
            resolveRef.current(true);
        } catch {
            // Error handling is expected to be done in onConfirm
            resolveRef.current(false);
        } finally {
            setIsLoading(false);
            setIsOpen(false);
            setOptions(null);
            resolveRef.current = null;
        }
    }, [options]);

    const handleOpenChange = useCallback(
        (open: boolean) => {
            // Ignore Cancel / Esc / scrim clicks while the confirm action is in flight.
            if (isLoading) {
                return;
            }
            setIsOpen(open);
            if (!open && resolveRef.current) {
                // Closed without confirming.
                resolveRef.current(false);
                resolveRef.current = null;
                setOptions(null);
            }
        },
        [isLoading]
    );

    const DialogComponent = options ? (
        <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
            <AlertDialogContent destructive={options.confirmVariant === 'danger'}>
                <AlertDialogHeader icon={options.icon}>
                    <AlertDialogTitle>{options.title}</AlertDialogTitle>
                    <AlertDialogDescription>{options.description}</AlertDialogDescription>
                    {options.docs && (
                        <StyledLink to={options.docs.url} type="external" icon>
                            {options.docs.title}
                        </StyledLink>
                    )}
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isLoading}>{options.cancelButtonText ?? 'Cancel'}</AlertDialogCancel>
                    <Button variant={options.confirmVariant ?? 'primary'} size="sm" loading={isLoading} onClick={() => void handleConfirm()}>
                        {options.confirmButtonText ?? 'Confirm'}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    ) : null;

    return {
        confirm,
        DialogComponent
    };
};
