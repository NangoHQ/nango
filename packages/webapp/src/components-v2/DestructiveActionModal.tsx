import { useState } from 'react';

import { Button } from './ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';

interface DestructiveActionModalProps {
    title: string;
    description: string;
    inputLabel: string;
    confirmationKeyword: string;
    confirmButtonText: string;
    cancelButtonText?: string;
    trigger?: React.ReactNode;
    onConfirm: () => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const DestructiveActionModal: React.FC<DestructiveActionModalProps> = ({
    title,
    description,
    inputLabel,
    confirmationKeyword,
    confirmButtonText,
    cancelButtonText = 'Cancel',
    trigger,
    onConfirm,
    open,
    onOpenChange
}) => {
    const [confirmText, setConfirmText] = useState('');
    const isConfirmed = confirmText === confirmationKeyword;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {trigger && <DialogTrigger>{trigger}</DialogTrigger>}
            <DialogContent className="gap-6">
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription className="-mt-3">{description}</DialogDescription>

                <div className="flex flex-col gap-2">
                    <p className="text-sm text-white break-words">{inputLabel}</p>
                    <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="Enter confirmation text" className="w-full" />
                </div>

                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="secondary">{cancelButtonText}</Button>
                    </DialogClose>
                    <Button variant="destructive" onClick={onConfirm} disabled={!isConfirmed}>
                        {confirmButtonText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
