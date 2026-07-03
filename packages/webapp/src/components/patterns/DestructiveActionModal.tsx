import { useId, useState } from 'react';

import { Button, Field, FieldLabel, Input } from '@nangohq/design-system';

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '../ui/Dialog';

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
    const inputId = useId();
    const isConfirmed = confirmText === confirmationKeyword;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {trigger && <DialogTrigger>{trigger}</DialogTrigger>}
            <DialogContent className="gap-6">
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription className="-mt-3">{description}</DialogDescription>

                <Field>
                    <FieldLabel htmlFor={inputId} className="break-words">
                        {inputLabel}
                    </FieldLabel>
                    <Input
                        id={inputId}
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="Enter confirmation text"
                        className="w-full"
                    />
                </Field>

                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">{cancelButtonText}</Button>
                    </DialogClose>
                    <Button variant="danger" onClick={onConfirm} disabled={!isConfirmed}>
                        {confirmButtonText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
