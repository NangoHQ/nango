import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEffectOnce } from 'react-use';

import { useStore } from '../../store';
import { useAnalyticsTrack } from '../../utils/analytics';
import { apiFetch } from '../../utils/api';
import { useSignin } from '../../utils/user';
import { useToast } from '@/hooks/useToast';
import DefaultLayout from '@/layout/DefaultLayout';

import type { ValidateEmailAndLogin } from '@nangohq/types';

export const EmailVerified: React.FC = () => {
    const [errorMessage, setErrorMessage] = useState('');
    const { token } = useParams<{ token: string }>();
    const signin = useSignin();
    const navigate = useNavigate();
    const { toast } = useToast();
    const analyticsTrack = useAnalyticsTrack();

    const env = useStore((state) => state.env);

    useEffectOnce(() => {
        if (!token) return;

        const verifyEmail = async () => {
            try {
                const res = await apiFetch(`/api/v1/account/verify/code`, {
                    method: 'POST',
                    body: JSON.stringify({ token })
                });

                const response = await res.json();

                if (res.status !== 200) {
                    const errorResponse: ValidateEmailAndLogin['Errors'] = response;

                    if (errorResponse.error.code === 'token_expired') {
                        toast({ title: errorResponse.error.message, variant: 'error' });
                        navigate(`/verify-email/expired/${token}`);
                        return;
                    }

                    setErrorMessage(errorResponse.error.message || 'Issue verifying email. Please try again.');
                    return;
                }

                const user: ValidateEmailAndLogin['Success']['user'] = response['user'];
                analyticsTrack('web:account_signup', {
                    user_id: user.id,
                    email: user.email,
                    name: user.name,
                    accountId: user.accountId
                });

                signin(user);
                toast({ title: 'Email verified successfully!', variant: 'success' });
                navigate(`/${env}/getting-started`);
            } catch {
                setErrorMessage('An error occurred while verifying the email. Please try again.');
            }
        };

        void verifyEmail();
    });

    return (
        <DefaultLayout>
            <div className="mt-4 flex flex-col justify-center items-center gap-8">
                <h2 className="text-text-primary text-title-group">{errorMessage ? 'Something went wrong' : 'Verifying your email'}</h2>
                {errorMessage ? <p className="text-text-light-gray text-body-small">{errorMessage}</p> : <Loader2 className="w-10 h-10 animate-spin" />}
            </div>
        </DefaultLayout>
    );
};
