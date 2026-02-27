import { zodResolver } from '@hookform/resolvers/zod';
import { CircleX } from 'lucide-react';
import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import z from 'zod';

import { Password, passwordSchema } from './components/Password';
import { useResetPasswordAPI } from '../../hooks/useAuth';
import DefaultLayout from '../../layout/DefaultLayout';
import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { Button } from '@/components-v2/ui/button';
import { Form, FormField } from '@/components-v2/ui/form';
import { useToast } from '@/hooks/useToast';

const resetPasswordSchema = z.object({
    password: passwordSchema
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export default function ResetPassword() {
    const form = useForm<ResetPasswordFormData>({
        resolver: zodResolver(resetPasswordSchema)
    });
    const { mutateAsync: resetPassword, isPending } = useResetPasswordAPI();

    const navigate = useNavigate();
    const { toast } = useToast();
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const { token } = useParams();

    if (!token) {
        // Route doesn't exist without token, so just satisfy the type checker
        return null;
    }

    const onSubmit = async (data: ResetPasswordFormData) => {
        setServerErrorMessage('');

        try {
            const result = await resetPassword({ token: token, password: data.password });

            if (result.status === 200) {
                toast({ title: 'Password updated!', variant: 'success' });
                navigate('/signin');
            } else {
                setServerErrorMessage('Your reset token is invalid or expired.');
            }
        } catch {
            setServerErrorMessage('Issue resetting password. Please try again.');
        }
    };

    return (
        <DefaultLayout className="gap-5">
            <Helmet>
                <title>Reset Password - Nango</title>
            </Helmet>
            <h2 className="text-title-group text-text-primary">Reset password</h2>

            {serverErrorMessage && (
                <Alert variant="destructive">
                    <CircleX />
                    <AlertDescription>{serverErrorMessage}</AlertDescription>
                </Alert>
            )}

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="w-full flex flex-col gap-5">
                    <FormField
                        control={form.control}
                        name="password"
                        render={() => <Password placeholder="New password" autoFocus autoComplete="new-password" />}
                    />

                    <Button type="submit" className="w-full" size={'lg'} loading={isPending} disabled={!form.formState.isValid}>
                        Reset password
                    </Button>
                </form>
            </Form>
        </DefaultLayout>
    );
}
