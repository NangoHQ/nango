import { useEffect, useState } from 'react';

import {
    Button,
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    InputGroup,
    InputGroupInput
} from '@nangohq/design-system';

import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/InputOTP';

import type { ButtonProps } from '@nangohq/design-system';
import type { MFACredential } from '@nangohq/types';

interface MfaChallengeDialogProps {
    open: boolean;
    /** What the factor unlocks, as an infinitive: 'change your password'. Completes the prompt. */
    purpose: string;
    confirmText: string;
    confirmVariant?: ButtonProps['variant'];
    /** Message from the last rejected attempt. Clear it when starting a new one. Hidden here once the user switches input mode. */
    error: string | null;
    verifying: boolean;
    onCancel: () => void;
    onConfirm: (credential: MFACredential) => void;
}

/**
 * Second factor for a sensitive action. Callers either open it up front, before anything is sent, or
 * send the request first and open it on `mfa_code_required` to collect the factor and retry with it.
 */
export const MfaChallengeDialog: React.FC<MfaChallengeDialogProps> = ({
    open,
    purpose,
    confirmText,
    confirmVariant,
    error,
    verifying,
    onCancel,
    onConfirm
}) => {
    const [value, setValue] = useState('');
    const [useRecoveryCode, setUseRecoveryCode] = useState(false);
    // `error` belongs to the caller and only clears on the next attempt, so switching input mode hides
    // it here instead. Otherwise a rejection stays on screen under the now-empty field of the other mode.
    const [errorDismissed, setErrorDismissed] = useState(false);

    // Controlled `open` changes (the caller closing after a success) do not fire Radix onOpenChange,
    // so reset from the prop rather than only from a user-driven close.
    useEffect(() => {
        if (!open) {
            setValue('');
            setUseRecoveryCode(false);
            setErrorDismissed(false);
        }
    }, [open]);

    useEffect(() => {
        if (error) {
            setValue('');
            setErrorDismissed(false);
        }
    }, [error]);

    const isValid = useRecoveryCode ? value.length > 0 : /^\d{6}$/.test(value);

    const confirm = () => {
        if (isValid) {
            onConfirm(useRecoveryCode ? { type: 'recoveryCode', recoveryCode: value } : { type: 'code', code: value });
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && !verifying && onCancel()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Confirm with two-factor authentication</DialogTitle>
                    <DialogDescription>
                        {useRecoveryCode ? `Enter one of your recovery codes to ${purpose}` : `Enter the code from your authenticator app to ${purpose}`}
                    </DialogDescription>
                </DialogHeader>
                <DialogBody>
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            confirm();
                        }}
                    >
                        <div className="flex flex-col items-center gap-3">
                            {useRecoveryCode ? (
                                <InputGroup>
                                    <InputGroupInput
                                        value={value}
                                        onChange={(event) => setValue(event.target.value)}
                                        placeholder="Recovery code"
                                        aria-label="Recovery code"
                                        autoComplete="one-time-code"
                                        disabled={verifying}
                                        autoFocus
                                    />
                                </InputGroup>
                            ) : (
                                <>
                                    <span className="text-body-small-medium text-text-strong">Enter your verification code:</span>
                                    <InputOTP maxLength={6} value={value} onChange={setValue} disabled={verifying} aria-label="Authenticator code" autoFocus>
                                        <InputOTPGroup>
                                            {[0, 1, 2, 3, 4, 5].map((i) => (
                                                <InputOTPSlot key={i} index={i} />
                                            ))}
                                        </InputOTPGroup>
                                    </InputOTP>
                                </>
                            )}
                            {error && !errorDismissed && (
                                <p role="alert" className="text-body-small-regular text-status-danger-text">
                                    {error}
                                </p>
                            )}
                            <button
                                type="button"
                                className="text-body-small-regular text-text-muted underline"
                                onClick={() => {
                                    setUseRecoveryCode((current) => !current);
                                    setValue('');
                                    setErrorDismissed(true);
                                }}
                                disabled={verifying}
                            >
                                {useRecoveryCode ? 'Use an authenticator code' : 'Use a recovery code'}
                            </button>
                        </div>
                    </form>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" size="sm" onClick={onCancel} disabled={verifying}>
                        Cancel
                    </Button>
                    <Button variant={confirmVariant} size="sm" onClick={confirm} loading={verifying} disabled={!isValid}>
                        {confirmText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
