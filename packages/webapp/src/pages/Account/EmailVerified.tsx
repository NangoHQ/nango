import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEffectOnce } from 'react-use';
import { useSWRConfig } from 'swr';

import { useToast } from '@/hooks/useToast';
import DefaultLayout from '@/layout/DefaultLayout';
import { track } from '../../utils/analytics';
import { apiFetch } from '../../utils/api';
import { useSignin } from '../../utils/user';

import type { GetUser, ValidateEmailAndLogin } from '@nangohq/types';

export const EmailVerified: React.FC = () => {
    const [errorMessage, setErrorMessage] = useState('');
    const { token } = useParams<{ token: string }>();
    const signin = useSignin();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { mutate } = useSWRConfig();

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
                track('web:account_signup', {
                    user_id: user.id,
                    accountId: user.accountId
                });

                signin(user);
                await mutate<GetUser['Success']>('/api/v1/user', { data: user as GetUser['Success']['data'] }, { revalidate: false });
                sessionStorage.setItem('show-email-verified-toast', 'true');

                navigate('/onboarding/account-discovery', { replace: true });
            } catch {
                setErrorMessage('An error occurred while verifying the email. Please try again.');
            }
        };

        void verifyEmail();
    });

    return (
        <DefaultLayout>
            <div className="mt-4 flex flex-col justify-center items-center gap-8">
                <h2 className="text-text-strong text-title-group">{errorMessage ? 'Something went wrong' : 'Verifying your email'}</h2>
                {errorMessage ? <p className="text-text-muted text-body-small">{errorMessage}</p> : <Loader2 className="w-10 h-10 animate-spin" />}
            </div>
        </DefaultLayout>
    );
};
