import { useEffect, useId, useState } from 'react';

import {
    Button,
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
    Input
} from '@nangohq/design-system';

import { usePutSpendAlert } from '@/hooks/usePlan';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { currencySymbol, parseThreshold, thresholdToInput } from '../spendAlert';

/** One dialog for add and edit: an account has at most one alert, so editing is the same PUT. */
export const SpendAlertDialog: React.FC<{
    thresholdInCents?: number | null;
    currency: string | null;
    children: React.ReactElement;
}> = ({ thresholdInCents = null, currency, children }) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { mutateAsync: putSpendAlert, isPending } = usePutSpendAlert(env);

    const [open, setOpen] = useState(false);
    const [amount, setAmount] = useState('');
    const [error, setError] = useState<string | null>(null);
    const inputId = useId();
    const formId = useId();
    const messageId = useId();

    const isEdit = thresholdInCents !== null;
    const symbol = currencySymbol(currency);

    // Reset on open rather than on close, so the field starts from the saved value every time —
    // including after that value changed while the dialog was shut.
    useEffect(() => {
        if (open) {
            setAmount(isEdit ? thresholdToInput(thresholdInCents) : '');
            setError(null);
        }
    }, [open, isEdit, thresholdInCents]);

    const handleSubmit = async () => {
        const parsed = parseThreshold(amount);
        if (!parsed.ok) {
            setError(parsed.error);
            return;
        }

        try {
            await putSpendAlert({ thresholdInCents: parsed.thresholdInCents });
            setOpen(false);
            toast({ title: isEdit ? 'Spend alert updated' : 'Spend alert added', variant: 'success' });
        } catch {
            toast({ title: 'Failed to save the spend alert', variant: 'error' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit spend alert' : 'Add spend alert'}</DialogTitle>
                    <DialogDescription>You&apos;ll get an email when your spend crosses this amount this month.</DialogDescription>
                </DialogHeader>
                <DialogBody>
                    <form
                        id={formId}
                        onSubmit={(event) => {
                            event.preventDefault();
                            void handleSubmit();
                        }}
                    >
                        <Field data-invalid={error ? true : undefined}>
                            <FieldLabel htmlFor={inputId}>{symbol ? `Alert threshold (${symbol})` : 'Alert threshold'}</FieldLabel>
                            <div className="flex w-full flex-col gap-1">
                                <Input
                                    id={inputId}
                                    name="threshold"
                                    // Not type="number": its spinners and scroll-to-change suit an amount
                                    // poorly, and it reports unparseable input as an empty string.
                                    inputMode="decimal"
                                    value={amount}
                                    onChange={(event) => {
                                        setAmount(event.target.value);
                                        setError(null);
                                    }}
                                    aria-invalid={error ? true : undefined}
                                    aria-describedby={messageId}
                                    placeholder="0.00"
                                    autoComplete="off"
                                    autoFocus
                                />
                                {error ? (
                                    <FieldError id={messageId}>{error}</FieldError>
                                ) : (
                                    <FieldDescription id={messageId}>Sent to your billing email and account admins.</FieldDescription>
                                )}
                            </div>
                        </Field>
                    </form>
                </DialogBody>
                <DialogFooter>
                    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" form={formId} size="sm" loading={isPending} disabled={!amount.trim()}>
                        {isEdit ? 'Save alert' : 'Add alert'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
