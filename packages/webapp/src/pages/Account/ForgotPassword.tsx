import { zodResolver } from '@hookform/resolvers/zod';
import { CircleX } from 'lucide-react';
import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useForm } from 'react-hook-form';
import z from 'zod';

import { Button, InputGroup, InputGroupInput } from '@nangohq/design-system';

import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/Form';
import { useToast } from '@/hooks/useToast';
import { useRequestPasswordResetAPI } from '../../hooks/useAuth';
import DefaultLayout from '../../layout/DefaultLayout';

const forgotPasswordSchema = z.object({
    email: z.string().email('Please enter a valid email address')
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function Signin() {
    const form = useForm<ForgotPasswordFormData>({
        resolver: zodResolver(forgotPasswordSchema),
        defaultValues: {
            email: ''
        },
        mode: 'onSubmit'
    });

    const { toast } = useToast();
    const { mutateAsync: requestPasswordReset, isPending } = useRequestPasswordResetAPI();

    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [done, setDone] = useState(false);

    const onSubmit = async (data: ForgotPasswordFormData) => {
        setServerErrorMessage('');

        try {
            await requestPasswordReset({ email: data.email });

            toast({
                title: 'Email sent!',
                variant: 'success'
            });
            setDone(true);
        } catch {
            setServerErrorMessage('Issue sending password reset email. Please try again.');
        }
    };

    return (
        <DefaultLayout className="gap-5">
            <Helmet>
                <title>Forgot Password - Nango</title>
            </Helmet>

            <h2 className="text-title-group text-text-strong">Request password reset</h2>

            {serverErrorMessage && (
                <Alert variant="error">
                    <CircleX />
                    <AlertDescription>{serverErrorMessage}</AlertDescription>
                </Alert>
            )}

            {!done && (
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="w-full flex flex-col gap-5">
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field, fieldState }) => (
                                <FormItem>
                                    <FormControl>
                                        <InputGroup>
                                            <InputGroupInput placeholder="Email" {...field} aria-invalid={!!fieldState.error} />
                                        </InputGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <Button type="submit" size={'lg'} loading={isPending}>
                            Send password reset email
                        </Button>
                    </form>
                </Form>
            )}

            {done && (
                <span className="text-body-medium-regular text-text-muted text-center text-wrap">
                    We&apos;ve sent a password reset email to <span className="text-text-strong">{form.getValues('email')}</span>.
                </span>
            )}
        </DefaultLayout>
    );
}
