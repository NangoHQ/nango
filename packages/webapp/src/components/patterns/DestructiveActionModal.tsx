import { useId, useState } from 'react';

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
    const formId = useId();
    const isConfirmed = confirmText === confirmationKeyword;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <DialogBody>
                    <form
                        id={formId}
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (isConfirmed) {
                                onConfirm();
                            }
                        }}
                    >
                        <Field>
                            <FieldLabel htmlFor={inputId}>{inputLabel}</FieldLabel>
                            <Input
                                id={inputId}
                                name="confirmation"
                                value={confirmText}
                                onChange={(event) => setConfirmText(event.target.value)}
                                placeholder="Enter confirmation text"
                                autoComplete="off"
                            />
                        </Field>
                    </form>
                </DialogBody>

                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline" size="sm">
                            {cancelButtonText}
                        </Button>
                    </DialogClose>
                    <Button type="submit" form={formId} variant="danger" size="sm" disabled={!isConfirmed}>
                        {confirmButtonText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
