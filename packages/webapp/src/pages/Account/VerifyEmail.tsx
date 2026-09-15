import { CircleX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { Alert, AlertDescription, Button } from '@nangohq/design-system';

import { useToast } from '@/hooks/useToast';
import { getOAuthConsentDestination, withOAuthConsentDestination } from '@/utils/oauthConsent';
import { useEmailByUuid, useResendVerificationEmailByUuid } from '../../hooks/useAuth';
import DefaultLayout from '../../layout/DefaultLayout';
import { APIError } from '../../utils/api';

export function VerifyEmail() {
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const navigate = useNavigate();
    const { toast } = useToast();
    const { uuid } = useParams();
    const [searchParams] = useSearchParams();
    const returnTo = getOAuthConsentDestination(searchParams.get('next'));
    const signinUrl = withOAuthConsentDestination('/signin', returnTo);

    const { data, error } = useEmailByUuid(uuid);
    const { mutateAsync: resendVerificationEmailByUuid, isPending: isResendingVerificationEmailByUuid } = useResendVerificationEmailByUuid();

    useEffect(() => {
        if (data?.verified) {
            toast({ title: 'Email already verified. Routing to the login page', variant: 'success' });
            navigate(signinUrl);
        }
    }, [data?.verified, navigate, signinUrl, toast]);

    useEffect(() => {
        if (error instanceof APIError && error.json && typeof error.json === 'object' && 'error' in error.json) {
            const err = error.json as { error: { message?: string } };
            setServerErrorMessage(err.error?.message ?? 'Issue verifying email. Please try again.');
        }
    }, [error]);

    if (!uuid) {
        // The route doesn't exist without a uuid, so just satisfy the type checker
        return null;
    }

    const handleResendEmail = async () => {
        setServerErrorMessage('');
        try {
            const res = await resendVerificationEmailByUuid({ uuid, returnTo });
            if (res.success) {
                toast({ title: 'Verification email sent again!', variant: 'success' });
            }
        } catch {
            setServerErrorMessage('Issue sending verification email. Please try again.');
        }
    };

    return (
        <DefaultLayout className="gap-10">
            <Helmet>
                <title>Verify Email - Nango</title>
            </Helmet>

            <div className="flex flex-col items-center gap-3">
                <h2 className="text-title-group text-text-strong">Verify your email</h2>

                {serverErrorMessage && (
                    <Alert variant="danger">
                        <CircleX />
                        <AlertDescription>{serverErrorMessage}</AlertDescription>
                    </Alert>
                )}

                <span className="text-body-medium-regular text-text-secondary text-center">
                    Check {data?.email || 'your email'} to verify your account and get started. If you verified your email from a different device,{' '}
                    <Button asChild variant="link-accent">
                        <Link to={signinUrl}>sign in here</Link>
                    </Button>
                    .
                </span>
            </div>

            <div className="grid w-full">
                <Button onClick={handleResendEmail} size="lg" loading={isResendingVerificationEmailByUuid}>
                    Resend email
                </Button>
            </div>
        </DefaultLayout>
    );
}
