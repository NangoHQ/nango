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

const errorMessages: Record<string, string> = {
    mfa_not_enabled: 'You need to enroll MFA before you can impersonate an account.',
    invalid_mfa_code: 'Invalid MFA code.'
};

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

    const impersonate = async (data: ImpersonateFormData, mfaCode?: string) => {
        return await apiAdminImpersonate(env, { accountUUID: data.account_uuid, loginReason: data.login_reason, code: mfaCode });
    };

    const onSubmit = async (data: ImpersonateFormData) => {
        const res = await impersonate(data);
        if (res.res.status === 200) {
            window.location.reload();
            return;
        }

        const code = 'error' in res.json ? res.json.error.code : undefined;
        if (code === 'mfa_code_required') {
            setChallengeOpen(true);
            return;
        }
        if (code === 'mfa_not_enabled') {
            form.setError('root', { message: errorMessages[code] });
            setNeedsEnrollment(true);
            return;
        }
        form.setError('root', { message: (code && errorMessages[code]) || JSON.stringify(res.json) });
    };

    const onConfirmCode = async () => {
        setVerifying(true);
        setCodeError(null);
        try {
            const res = await impersonate(form.getValues(), code);
            if (res.res.status === 200) {
                window.location.reload();
                return;
            }

            const errorCode = 'error' in res.json ? res.json.error.code : undefined;
            setCode('');
            if (errorCode === 'mfa_not_enabled') {
                closeChallenge();
                form.setError('root', { message: errorMessages[errorCode] });
                setNeedsEnrollment(true);
                return;
            }
            setCodeError((errorCode && errorMessages[errorCode]) || JSON.stringify(res.json));
        } catch {
            setCode('');
            setCodeError('Could not reach the server. Try again.');
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div className="w-100 flex flex-col gap-3 p-6 border border-border-default rounded-md relative">
            <h3 className="text-heading-sm text-text-strong absolute top-[-12px] left-3 bg-surface-canvas px-1">Nango admin</h3>
            <h3 className="text-heading-sm text-text-strong">Impersonate account</h3>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
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
