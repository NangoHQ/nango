import { CircleX } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { Alert, AlertDescription, Button } from '@nangohq/design-system';

import { useToast } from '@/hooks/useToast';
import DefaultLayout from '@/layout/DefaultLayout';
import { getOAuthConsentDestination, withOAuthConsentDestination } from '@/utils/oauthConsent';
import { track } from '../../utils/analytics';
import { apiFetch } from '../../utils/api';

import type { ConfirmEmail } from '@nangohq/types';

export const EmailVerified: React.FC = () => {
    const [errorMessage, setErrorMessage] = useState('');
    const [isConfirming, setIsConfirming] = useState(false);
    const { token } = useParams<{ token: string }>();
    const [searchParams] = useSearchParams();
    const returnTo = getOAuthConsentDestination(searchParams.get('next'));
    const navigate = useNavigate();
    const { toast } = useToast();

    const confirmEmail = async () => {
        if (!token) {
            setErrorMessage('The verification link is invalid. Please request a new email.');
            return;
        }

        setErrorMessage('');
        setIsConfirming(true);

        try {
            const res = await apiFetch(`/api/v1/account/verify/code`, {
                method: 'POST',
                body: JSON.stringify({ token })
            });
            const response = await res.json();

            if (res.status !== 200) {
                const errorResponse: ConfirmEmail['Errors'] = response;

                if (errorResponse.error.code === 'token_expired') {
                    toast({ title: errorResponse.error.message, variant: 'error' });
                    navigate(withOAuthConsentDestination(`/verify-email/expired/${token}`, returnTo));
                    return;
                }

                if (errorResponse.error.code == 'invalid_token') {
                    setErrorMessage('This link is no longer valid. It may have already been used - try signing in.');
                    return;
                }

                setErrorMessage(errorResponse.error.message || 'Issue verifying email. Please try again.');
                return;
            }

            const confirmation: ConfirmEmail['Success'] = response;
            track('web:account_signup', { user_id: confirmation.user.id, accountId: confirmation.user.accountId });
            toast({ title: 'Email verified successfully!', variant: 'success' });

            const destination = returnTo ?? '/onboarding/account-discovery';
            navigate(`/signin?next=${encodeURIComponent(destination)}`, {
                replace: true,
                state: { email: confirmation.user.email }
            });
        } catch {
            setErrorMessage('An error occurred while verifying the email. Please try again.');
        } finally {
            setIsConfirming(false);
        }
    };

    return (
        <DefaultLayout className="gap-10">
            <div className="flex flex-col items-center gap-3">
                <h2 className="text-text-strong text-title-group">Confirm your email</h2>
                <p className="text-text-secondary text-body-medium-regular text-center">Confirm your email address to finish creating your account.</p>

                {errorMessage && (
                    <Alert variant="danger">
                        <CircleX />
                        <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                )}
            </div>

            <div className="grid w-full">
                <Button onClick={confirmEmail} size="lg" loading={isConfirming}>
                    Confirm email
                </Button>
            </div>
        </DefaultLayout>
    );
};
