import { useState } from 'react';

import { Button } from './ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

export interface ConfirmDialogOptions {
    title: string;
    description: string;
    confirmButtonText?: string;
    cancelButtonText?: string;
    confirmVariant?: 'primary' | 'destructive' | 'secondary' | 'tertiary';
    icon?: React.ReactNode;
    onConfirm: () => void | Promise<void>;
}

interface ConfirmDialogProps extends ConfirmDialogOptions {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    open,
    onOpenChange,
    title,
    description,
    confirmButtonText = 'Confirm',
    cancelButtonText = 'Cancel',
    confirmVariant = 'primary',
    icon,
    onConfirm,
    loading = false
}) => {
    const [isLoading, setIsLoading] = useState(false);

    const handleConfirm = async () => {
        setIsLoading(true);
        try {
            await onConfirm();
            onOpenChange(false);
        } catch (err) {
            // Error handling is expected to be done in onConfirm
            void err;
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancel = () => {
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        {icon && <div className="shrink-0 [&_svg]:size-5 [&_svg]:text-icon-primary ">{icon}</div>}
                        <DialogTitle>{title}</DialogTitle>
                    </div>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="secondary" onClick={handleCancel} disabled={isLoading || loading}>
                            {cancelButtonText}
                        </Button>
                    </DialogClose>
                    <Button variant={confirmVariant} onClick={handleConfirm} disabled={isLoading || loading}>
                        {confirmButtonText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
