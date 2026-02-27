import { zodResolver } from '@hookform/resolvers/zod';
import { CircleX } from 'lucide-react';
import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useForm } from 'react-hook-form';
import z from 'zod';

import { useRequestPasswordResetAPI } from '../../hooks/useAuth';
import DefaultLayout from '../../layout/DefaultLayout';
import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { Button } from '@/components-v2/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components-v2/ui/form';
import { InputGroup, InputGroupInput } from '@/components-v2/ui/input-group';
import { useToast } from '@/hooks/useToast';

const forgotPasswordSchema = z.object({
    email: z.string().email('Please enter a valid email address')
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function Signin() {
    const form = useForm<ForgotPasswordFormData>({
        resolver: zodResolver(forgotPasswordSchema)
    });

    const { toast } = useToast();
    const { mutateAsync: requestPasswordReset, isPending } = useRequestPasswordResetAPI();

    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [done, setDone] = useState(false);

    const onSubmit = async (data: ForgotPasswordFormData) => {
        setServerErrorMessage('');

        try {
            const result = await requestPasswordReset({ email: data.email });

            if (result.status === 200) {
                toast({
                    title: 'Email sent!',
                    variant: 'success'
                });
                setDone(true);
            } else {
                setServerErrorMessage('No user matching this email.');
            }
        } catch {
            setServerErrorMessage('Issue sending password reset email. Please try again.');
        }
    };

    return (
        <DefaultLayout className="gap-5">
            <Helmet>
                <title>Forgot Password - Nango</title>
            </Helmet>

            <h2 className="text-title-group text-text-primary">Request password reset</h2>

            {serverErrorMessage && (
                <Alert variant="destructive">
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
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <InputGroup className="h-11">
                                            <InputGroupInput placeholder="Email" {...field} />
                                        </InputGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <Button type="submit" className="w-full" size={'lg'} loading={isPending} disabled={!form.formState.isValid}>
                            Send password reset email
                        </Button>
                    </form>
                </Form>
            )}

            {done && (
                <span className="text-body-medium-regular text-text-tertiary text-center text-wrap">
                    We&apos;ve sent a password reset email to <span className="text-text-primary">{form.getValues('email')}</span>.
                </span>
            )}
        </DefaultLayout>
    );
}
