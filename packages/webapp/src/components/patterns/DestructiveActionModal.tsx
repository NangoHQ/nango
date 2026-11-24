import { useEffect, useId, useRef, useState } from 'react';

import {
    Button,
    Dialog,
    DialogBody,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    Field,
    FieldLabel,
    Input
} from '@nangohq/design-system';

interface DestructiveActionModalProps {
    title: string;
    description: React.ReactNode;
    inputLabel: string;
    confirmationKeyword: string;
    confirmButtonText: string;
    cancelButtonText?: string;
    trigger?: React.ReactNode;
    onConfirm: () => unknown;
    loading?: boolean;
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
    loading = false,
    open,
    onOpenChange
}) => {
    const [confirmText, setConfirmText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submittingRef = useRef(false);
    const inputId = useId();
    const formId = useId();
    const isConfirmed = confirmText === confirmationKeyword;
    const isPending = loading || isSubmitting;

    // Controlled `open` changes (e.g. parent setOpen(false) after confirm) do not fire Radix
    // onOpenChange, so reset from the prop as well as from user-driven closes.
    useEffect(() => {
        if (!open) {
            setConfirmText('');
        }
    }, [open]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!isConfirmed || isPending || submittingRef.current) {
            return;
        }

        submittingRef.current = true;
        setIsSubmitting(true);
        try {
            await onConfirm();
        } catch {
            // Error presentation (e.g. toast) is owned by onConfirm; keep the modal open so the user can retry.
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    };

    const handleOpenChange = (nextOpen: boolean) => {
        if (isPending) {
            return;
        }
        onOpenChange(nextOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent
                showCloseButton={!isPending}
                onEscapeKeyDown={(event) => {
                    if (isPending) {
                        event.preventDefault();
                    }
                }}
                onInteractOutside={(event) => {
                    if (isPending) {
                        event.preventDefault();
                    }
                }}
            >
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <DialogBody>
                    <form id={formId} onSubmit={(event) => void handleSubmit(event)}>
                        <Field>
                            <FieldLabel htmlFor={inputId}>{inputLabel}</FieldLabel>
                            <Input
                                id={inputId}
                                name="confirmation"
                                value={confirmText}
                                onChange={(event) => setConfirmText(event.target.value)}
                                placeholder="Enter confirmation text"
                                autoComplete="off"
                                disabled={isPending}
                            />
                        </Field>
                    </form>
                </DialogBody>

                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline" size="sm" disabled={isPending}>
                            {cancelButtonText}
                        </Button>
                    </DialogClose>
                    <Button type="submit" form={formId} variant="danger" size="sm" loading={isPending} disabled={!isConfirmed}>
                        {confirmButtonText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
