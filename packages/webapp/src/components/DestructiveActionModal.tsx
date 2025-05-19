import { useState } from 'react';

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from './ui/Dialog';
import { Button } from './ui/button/Button';
import { Input } from './ui/input/Input';

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
            <DialogContent>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>

                <div className="mt-4 flex flex-col gap-4">
                    <p className="text-sm text-white break-words">{inputLabel}</p>
                    <Input
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="Enter confirmation text"
                        variant="black"
                        className="w-full"
                    />
                </div>

                <DialogFooter className="mt-4">
                    <DialogClose asChild>
                        <Button variant="zinc">{cancelButtonText}</Button>
                    </DialogClose>
                    <Button variant="danger" onClick={onConfirm} disabled={!isConfirmed}>
                        {confirmButtonText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
