import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import z from 'zod';

import {
    Button,
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    FieldLabel,
    Input
} from '@nangohq/design-system';

import { Alert, AlertDescription } from '@/components/ui/Alert';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/InputOTP';
import { Form, FormControl, FormField, FormItem, FormMessage } from '../../../components/ui/Form';
import { apiAdminImpersonate } from '../../../hooks/useAdmin';
import { useStore } from '../../../store';

const ImpersonateFormSchema = z.object({
    account_uuid: z.string().uuid(),
    login_reason: z.string().min(1).max(1024)
});

type ImpersonateFormData = z.infer<typeof ImpersonateFormSchema>;

const MFA_NOT_ENABLED_MESSAGE = 'You need to enroll MFA before you can impersonate an account.';

const errorMessages: Record<string, string> = {
    invalid_mfa_code: 'Invalid MFA code.'
};

const IMPERSONATE_TIMEOUT_MS = 15_000;

// The request may have switched the session before it stalled, so a reload is the only way to tell.
function timedOut(err: unknown) {
    return err instanceof DOMException && err.name === 'TimeoutError';
}

export const ImpersonateForm: React.FC = () => {
    const env = useStore((state) => state.env);
    const [needsEnrollment, setNeedsEnrollment] = useState(false);
    const [challengeOpen, setChallengeOpen] = useState(false);
    const [code, setCode] = useState('');
    const [codeError, setCodeError] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(false);
    const hasValidCode = /^\d{6}$/.test(code);

    const form = useForm<ImpersonateFormData>({
        resolver: zodResolver(ImpersonateFormSchema),
        defaultValues: {
            account_uuid: '',
            login_reason: ''
        }
    });

    const closeChallenge = () => {
        setChallengeOpen(false);
        setCode('');
        setCodeError(null);
    };

    const attempt = async (mfaCode?: string) => {
        const values = form.getValues();
        const showError =
            mfaCode === undefined
                ? (message: string) => form.setError('root', { message })
                : (message: string) => {
                      setCode('');
                      setCodeError(message);
                  };

        try {
            const result = await apiAdminImpersonate(
                env,
                { accountUUID: values.account_uuid, loginReason: values.login_reason, code: mfaCode },
                AbortSignal.timeout(IMPERSONATE_TIMEOUT_MS)
            );

            if (result.ok) {
                window.location.reload();
                return;
            }

            if (result.errorCode === 'mfa_code_required') {
                setChallengeOpen(true);
                return;
            }
            if (result.errorCode === 'mfa_not_enabled') {
                closeChallenge();
                form.setError('root', { message: MFA_NOT_ENABLED_MESSAGE });
                setNeedsEnrollment(true);
                return;
            }
            showError((result.errorCode && errorMessages[result.errorCode]) || 'Could not impersonate this account.');
        } catch (err) {
            if (timedOut(err)) {
                window.location.reload();
                return;
            }
            showError('Could not reach the server. Try again.');
        }
    };

    const onConfirmCode = async () => {
        setVerifying(true);
        setCodeError(null);
        try {
            await attempt(code);
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div className="w-100 flex flex-col gap-3 p-6 border border-border-default rounded-md relative">
            <h3 className="text-heading-sm text-text-strong absolute top-[-12px] left-3 bg-surface-canvas px-1">Nango admin</h3>
            <h3 className="text-heading-sm text-text-strong">Impersonate account</h3>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(() => attempt())} className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                        <FieldLabel htmlFor="account_uuid">Account UUID</FieldLabel>
                        <FormField
                            control={form.control}
                            name="account_uuid"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <Input placeholder="Account UUID" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <FieldLabel htmlFor="login_reason">Login reason</FieldLabel>
                        <FormField
                            control={form.control}
                            name="login_reason"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <Input placeholder="Login reason" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    <Alert variant="warning">
                        <TriangleAlert />
                        <AlertDescription>
                            <span>Impersonating an account will allow you to login as that account and perform actions on their behalf.</span>
                        </AlertDescription>
                    </Alert>
                    <div className="self-end">
                        <Button type="submit" variant="danger" loading={form.formState.isSubmitting}>
                            Impersonate
                        </Button>
                    </div>
                    {form.formState.errors.root && <p className="mt-2 mx-4 text-sm text-status-danger-text">{form.formState.errors.root.message}</p>}
                    {needsEnrollment && (
                        <div className="mt-1 mx-4">
                            <Button asChild variant="link-accent">
                                <Link to="/user-settings/enable-2fa">Enroll 2FA</Link>
                            </Button>
                        </div>
                    )}
                </form>
            </Form>

            <Dialog open={challengeOpen} onOpenChange={(open) => !open && !verifying && closeChallenge()}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm with two-factor authentication</DialogTitle>
                        <DialogDescription>Enter the 6-digit code from your authenticator app to impersonate this account</DialogDescription>
                    </DialogHeader>
                    <DialogBody>
                        <div className="flex flex-col items-center gap-3">
                            <span className="text-body-small-medium text-text-strong">Enter your verification code:</span>
                            <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus>
                                <InputOTPGroup>
                                    {[0, 1, 2, 3, 4, 5].map((i) => (
                                        <InputOTPSlot key={i} index={i} />
                                    ))}
                                </InputOTPGroup>
                            </InputOTP>
                            {codeError && <p className="text-sm text-status-danger-text">{codeError}</p>}
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={closeChallenge} disabled={verifying}>
                            Cancel
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => void onConfirmCode()} loading={verifying} disabled={!hasValidCode}>
                            Impersonate
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
