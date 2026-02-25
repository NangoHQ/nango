import { zodResolver } from '@hookform/resolvers/zod';
import { CircleX, ExternalLink, Loader2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import z from 'zod';

import GoogleButton from '@/components/ui/button/Auth/Google';
import { StyledLink } from '@/components-v2/StyledLink';
import { Alert, AlertActions, AlertButton, AlertDescription, AlertTitle } from '@/components-v2/ui/alert';
import { Button } from '@/components-v2/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components-v2/ui/form';
import { InputGroup, InputGroupInput } from '@/components-v2/ui/input-group';
import { useResendVerificationEmail, useSigninAPI } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import DefaultLayout from '@/layout/DefaultLayout';
import { globalEnv } from '@/utils/env';
import { useSignin } from '@/utils/user';

import type { ApiUser } from '@nangohq/types';

const signinSchema = z.object({
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(1, 'Password is required')
});

type SigninFormData = z.infer<typeof signinSchema>;

export const Signin: React.FC = () => {
    const { mutateAsync: signinMutation, isPending } = useSigninAPI();
    const { mutateAsync: resendVerificationEmailMutation, isPending: isResendingEmail } = useResendVerificationEmail();
    const signin = useSignin();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [errorMessage, setServerErrorMessage] = useState('');
    const [showResendEmail, setShowResendEmail] = useState(false);

    const form = useForm<SigninFormData>({
        resolver: zodResolver(signinSchema)
    });

    const onSubmitForm = async (data: SigninFormData) => {
        setServerErrorMessage('');
        try {
            const res = await signinMutation({ email: data.email, password: data.password });

            if (res.status === 200) {
                const user: ApiUser = res.json.user;
                signin(user);
                navigate('/');
            } else if (res.status === 401) {
                setServerErrorMessage('Invalid email or password.');
                form.resetField('password', { defaultValue: '' });
                form.setFocus('password');
            } else if (res.status === 400) {
                if (res.json.error.code === 'email_not_verified') {
                    setShowResendEmail(true);
                    setServerErrorMessage('Please verify your email before logging in.');
                } else {
                    setServerErrorMessage('Issue logging in. Please try again.');
                }
            }
        } catch {
            setServerErrorMessage('Issue logging in. Please try again.');
        }
    };

    const resendVerificationEmail = async () => {
        setServerErrorMessage('');

        const email = form.getValues('email');

        try {
            await resendVerificationEmailMutation({ email });
            toast({
                title: 'Verification email sent.',
                variant: 'success'
            });
            setShowResendEmail(false);
        } catch {
            setServerErrorMessage('Issue sending verification email. Please try again.');
        }
    };

    return (
        <DefaultLayout className="gap-10">
            <Helmet>
                <title>Sign in - Nango</title>
            </Helmet>

            <div className="flex flex-col items-center gap-5 w-full">
                <div className="flex flex-col gap-3 items-center">
                    <h2 className="text-title-group text-text-primary">Log in to Nango</h2>
                    <span className="text-body-medium-regular text-text-tertiary">
                        Don&apos;t have an account? <StyledLink to="/signup">Sign up.</StyledLink>
                    </span>
                </div>

                {errorMessage && !showResendEmail && (
                    <Alert variant="destructive">
                        <CircleX />
                        <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                )}

                {showResendEmail && (
                    <Alert variant="warning">
                        <TriangleAlert />
                        <AlertTitle>Please verify your email</AlertTitle>
                        <AlertDescription>We&apos;ve sent a verification email to {form.getValues('email')}.</AlertDescription>
                        <AlertActions>
                            <AlertButton onClick={resendVerificationEmail} variant="warning" disabled={isResendingEmail}>
                                Resend
                                {isResendingEmail ? <Loader2 className="animate-spin" /> : <ExternalLink />}
                            </AlertButton>
                        </AlertActions>
                    </Alert>
                )}

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmitForm)} className="w-full flex flex-col gap-5">
                        <div className="w-full flex flex-col gap-2.5">
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field, fieldState }) => (
                                    <FormItem>
                                        <FormControl>
                                            <InputGroup className="h-11">
                                                <InputGroupInput placeholder="Email" {...field} aria-invalid={!!fieldState.error} />
                                            </InputGroup>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="order-3">
                                <FormField
                                    control={form.control}
                                    name="password"
                                    render={({ field, fieldState }) => (
                                        <FormItem>
                                            <FormControl>
                                                <InputGroup className="h-11">
                                                    <InputGroupInput
                                                        placeholder="Password"
                                                        type="password"
                                                        autoComplete="current-password"
                                                        {...field}
                                                        aria-invalid={!!fieldState.error}
                                                    />
                                                </InputGroup>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {/* Using `order` to show this above the password input, but tabbing from email input goes to password input first*/}
                            <StyledLink to="/forgot-password" className="text-body-small-light text-text-tertiary self-end order-2">
                                Forgot your password?
                            </StyledLink>
                        </div>

                        <Button type="submit" size="lg" className="w-full" loading={isPending} disabled={!form.formState.isValid}>
                            {isPending ? 'Logging in...' : 'Log in'}
                        </Button>
                    </form>
                </Form>
            </div>

            <div className="flex flex-col gap-10 w-full">
                {globalEnv.features.managedAuth && (
                    <div className="flex flex-col gap-5 items-center w-full">
                        <div className="flex items-center justify-center gap-3 w-full">
                            <div className="border-t-[0.5px] border-border-strong w-full"></div>
                            <span className="text-body-medium-regular text-text-secondary shrink-0">or continue with</span>
                            <div className="border-t-[0.5px] border-border-strong w-full"></div>
                        </div>

                        <GoogleButton text="Sign in with Google" setServerErrorMessage={setServerErrorMessage} />
                    </div>
                )}

                <span className="text-center w-full text-body-medium-regular text-text-tertiary">
                    By signing in, you agree to our <br />{' '}
                    <StyledLink type="external" to="https://www.nango.dev/terms" className="text-text-secondary text-body-medium-regular">
                        Terms of Service
                    </StyledLink>{' '}
                    and{' '}
                    <StyledLink type="external" to="https://www.nango.dev/privacy-policy" className="text-text-secondary text-body-medium-regular">
                        Privacy Policy
                    </StyledLink>
                    .
                </span>
            </div>
        </DefaultLayout>
    );
};
