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

import type { MFACredential } from '@nangohq/types';

interface MfaChallengeDialogProps {
    open: boolean;
    /** What the factor unlocks, as an infinitive: 'change your password'. Completes the prompt. */
    purpose: string;
    confirmText: string;
    /** Message from the last rejected attempt. Clear it when starting a new one. */
    error: string | null;
    verifying: boolean;
    onCancel: () => void;
    onConfirm: (credential: MFACredential) => void;
}

/**
 * Second factor for an action the user already started: the caller sends the request, and on
 * `mfa_code_required` opens this to collect the factor and send the same request again with it.
 */
export const MfaChallengeDialog: React.FC<MfaChallengeDialogProps> = ({ open, purpose, confirmText, error, verifying, onCancel, onConfirm }) => {
    const [value, setValue] = useState('');
    const [useRecoveryCode, setUseRecoveryCode] = useState(false);

    // Controlled `open` changes (the caller closing after a success) do not fire Radix onOpenChange,
    // so reset from the prop rather than only from a user-driven close.
    useEffect(() => {
        if (!open) {
            setValue('');
            setUseRecoveryCode(false);
        }
    }, [open]);

    useEffect(() => {
        if (error) {
            setValue('');
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
                            {error && (
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
                    <Button size="sm" onClick={confirm} loading={verifying} disabled={!isValid}>
                        {confirmText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
