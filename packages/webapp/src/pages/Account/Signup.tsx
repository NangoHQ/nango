import { zodResolver } from '@hookform/resolvers/zod';
import { CircleX, ExternalLink, Loader2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import z from 'zod';

import DefaultLayout from '../../layout/DefaultLayout';
import GoogleButton from '@/components/ui/button/Auth/Google';
import { StyledLink } from '@/components-v2/StyledLink';
import { Alert, AlertActions, AlertButton, AlertDescription, AlertTitle } from '@/components-v2/ui/alert';
import { Button } from '@/components-v2/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components-v2/ui/form';
import { InputGroup, InputGroupInput } from '@/components-v2/ui/input-group';
import { useResendVerificationEmail, useSignupAPI } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { globalEnv } from '@/utils/env';

const signupSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(1, 'Password is required')
});

type SignupFormData = z.infer<typeof signupSchema>;

export const Signup: React.FC = () => {
    const form = useForm<SignupFormData>({
        resolver: zodResolver(signupSchema)
    });
    const navigate = useNavigate();
    const { toast } = useToast();

    const { mutateAsync: signupMutation, isPending } = useSignupAPI();
    const { mutateAsync: resendVerificationEmailMutation, isPending: isResendingEmail } = useResendVerificationEmail();

    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [showResendEmail, setShowResendEmail] = useState(false);

    const onSubmitForm = async (data: SignupFormData) => {
        setServerErrorMessage('');
        try {
            const res = await signupMutation(data);
            if (res.status === 200) {
                const { uuid, verified } = res.json.data;
                if (!verified) {
                    navigate(`/verify-email/${uuid}`);
                } else {
                    navigate('/');
                }
                return;
            }

            setServerErrorMessage(res.json.error.message || 'Issue signing up. Please try again.');
            if (res.json.error.code === 'email_not_verified') {
                setShowResendEmail(true);
            }
        } catch {
            setServerErrorMessage('Issue signing up. Please try again.');
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
                <title>Sign up - Nango</title>
            </Helmet>

            <div className="flex flex-col gap-3 items-center">
                <h2 className="text-title-group text-text-primary">Sign up to Nango</h2>
                <span className="text-body-medium-regular text-text-tertiary">
                    Already have an account? <StyledLink to="/signin">Log in.</StyledLink>
                </span>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitForm)} className="w-full flex flex-col gap-5">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field, fieldState }) => (
                            <FormItem>
                                <FormControl>
                                    <InputGroup className="h-11">
                                        <InputGroupInput placeholder="Name" {...field} aria-invalid={!!fieldState.error} />
                                    </InputGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
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

                    <FormField
                        control={form.control}
                        name="password"
                        render={({ field, fieldState }) => (
                            <FormItem>
                                <FormControl>
                                    <InputGroup className="h-11">
                                        <InputGroupInput placeholder="Password" type="password" {...field} aria-invalid={!!fieldState.error} />
                                    </InputGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {serverErrorMessage && !showResendEmail && (
                        <Alert variant="destructive">
                            <CircleX />
                            <AlertDescription>{serverErrorMessage}</AlertDescription>
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

                    <Button type="submit" size="lg" className="w-full" loading={isPending}>
                        {isPending ? 'Signing up...' : 'Sign up'}
                    </Button>
                </form>
            </Form>

            <div className="flex flex-col gap-10 w-full">
                {globalEnv.features.managedAuth && (
                    <div className="flex flex-col gap-5 items-center w-full">
                        <div className="flex items-center justify-center gap-3 w-full">
                            <div className="border-t-[0.5px] border-border-strong w-full"></div>
                            <span className="text-body-medium-regular text-text-secondary shrink-0">or continue with</span>
                            <div className="border-t-[0.5px] border-border-strong w-full"></div>
                        </div>

                        <GoogleButton text="Sign up with Google" setServerErrorMessage={setServerErrorMessage} />
                    </div>
                )}

                <span className="text-center w-full text-body-medium-regular text-text-tertiary">
                    By signing up, you agree to our <br />{' '}
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
