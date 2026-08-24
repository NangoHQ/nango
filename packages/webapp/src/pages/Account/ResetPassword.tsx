import { zodResolver } from '@hookform/resolvers/zod';
import { CircleX } from 'lucide-react';
import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import z from 'zod';

import { Alert, AlertDescription, Button } from '@nangohq/design-system';

import { MfaChallengeDialog } from '@/components/patterns/MfaChallengeDialog';
import { Form, FormField } from '@/components/ui/Form';
import { useToast } from '@/hooks/useToast';
import { mfaErrorMessage } from '@/utils/mfaErrors';
import { useResetPasswordAPI } from '../../hooks/useAuth';
import DefaultLayout from '../../layout/DefaultLayout';
import { Password, passwordSchema } from './components/Password';

import type { MFACredential } from '@nangohq/types';

const resetPasswordSchema = z.object({
    password: passwordSchema
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export default function ResetPassword() {
    const form = useForm<ResetPasswordFormData>({
        resolver: zodResolver(resetPasswordSchema),
        defaultValues: {
            password: ''
        },
        mode: 'onSubmit'
    });
    const { mutateAsync: resetPassword, isPending } = useResetPasswordAPI();

    const navigate = useNavigate();
    const { toast } = useToast();
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [challengeOpen, setChallengeOpen] = useState(false);
    const [challengeError, setChallengeError] = useState<string | null>(null);
    const { token } = useParams();

    if (!token) {
        // Route doesn't exist without token, so just satisfy the type checker
        return null;
    }

    const closeChallenge = () => {
        setChallengeOpen(false);
        setChallengeError(null);
    };

    const attempt = async (mfa?: MFACredential) => {
        setServerErrorMessage('');
        setChallengeError(null);

        try {
            const result = await resetPassword({ token, password: form.getValues().password, mfa });

            if (result.status === 200) {
                closeChallenge();
                toast({ title: 'Password updated!', variant: 'success' });
                navigate('/signin');
                return;
            }

            const { code } = result.json.error;
            if (code === 'mfa_code_required') {
                setChallengeOpen(true);
                return;
            }
            if (code === 'invalid_mfa_code') {
                setChallengeError(mfaErrorMessage(code));
                return;
            }

            closeChallenge();
            setServerErrorMessage('Your reset token is invalid or expired.');
        } catch {
            closeChallenge();
            setServerErrorMessage('Issue resetting password. Please try again.');
        }
    };

    return (
        <DefaultLayout className="gap-5">
            <Helmet>
                <title>Reset Password - Nango</title>
            </Helmet>
            <h2 className="text-title-group text-text-strong">Reset password</h2>

            {serverErrorMessage && (
                <Alert variant="danger">
                    <CircleX />
                    <AlertDescription>{serverErrorMessage}</AlertDescription>
                </Alert>
            )}

            <Form {...form}>
                <form onSubmit={form.handleSubmit(() => attempt())} className="w-full flex flex-col gap-5">
                    <FormField
                        control={form.control}
                        name="password"
                        render={() => <Password placeholder="New password" autoFocus autoComplete="new-password" />}
                    />

                    <Button type="submit" size={'lg'} loading={isPending}>
                        Reset password
                    </Button>
                </form>
            </Form>

            <MfaChallengeDialog
                open={challengeOpen}
                purpose="reset your password"
                confirmText="Reset password"
                error={challengeError}
                verifying={isPending}
                onCancel={closeChallenge}
                onConfirm={(mfa) => void attempt(mfa)}
            />
        </DefaultLayout>
    );
}
