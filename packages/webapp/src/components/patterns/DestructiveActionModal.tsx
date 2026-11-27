import { Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
    Button,
    Field,
    FieldLabel,
    Input
} from '@nangohq/design-system';

import type { AlertDialogContentProps } from '@nangohq/design-system';

interface DestructiveActionModalProps {
    title: React.ReactNode;
    description: React.ReactNode;
    confirmationKeyword: string;
    confirmButtonText: string;
    cancelButtonText?: string;
    trigger?: React.ReactNode;
    onConfirm: () => Promise<unknown>;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    size?: AlertDialogContentProps['size'];
}

export const DestructiveActionModal: React.FC<DestructiveActionModalProps> = ({
    title,
    description,
    confirmationKeyword,
    confirmButtonText,
    cancelButtonText = 'Cancel',
    trigger,
    onConfirm,
    open,
    onOpenChange,
    size
}) => {
    const [confirmText, setConfirmText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submittingRef = useRef(false);
    const inputId = useId();
    const formId = useId();
    const isConfirmed = confirmText === confirmationKeyword;

    // Controlled `open` changes (e.g. parent setOpen(false) after confirm) do not fire Radix
    // onOpenChange, so reset from the prop as well as from user-driven closes.
    useEffect(() => {
        if (!open) {
            setConfirmText('');
        }
    }, [open]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!isConfirmed || isSubmitting || submittingRef.current) {
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
        if (isSubmitting) {
            return;
        }
        onOpenChange(nextOpen);
    };

    return (
        <AlertDialog open={open} onOpenChange={handleOpenChange}>
            {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
            <AlertDialogContent
                size={size}
                destructive
                onEscapeKeyDown={(event) => {
                    if (isSubmitting) {
                        event.preventDefault();
                    }
                }}
            >
                <AlertDialogHeader icon={<Trash2 />}>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <form id={formId} className="px-4 pb-4" onSubmit={(event) => void handleSubmit(event)}>
                    <Field>
                        <FieldLabel htmlFor={inputId}>
                            <span>
                                Type <code className="type-code-regular-sm">{confirmationKeyword}</code> to confirm
                            </span>
                        </FieldLabel>
                        <Input
                            id={inputId}
                            name="confirmation"
                            mono
                            value={confirmText}
                            onChange={(event) => setConfirmText(event.target.value)}
                            autoComplete="off"
                            spellCheck={false}
                            disabled={isSubmitting}
                        />
                    </Field>
                </form>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isSubmitting}>{cancelButtonText}</AlertDialogCancel>
                    <Button type="submit" form={formId} variant="danger" size="sm" loading={isSubmitting} disabled={!isConfirmed}>

                        {confirmButtonText}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
