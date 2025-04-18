import { useState, useEffect } from 'react';
import { Loading } from '@geist-ui/core';
import { useParams, useNavigate } from 'react-router-dom';
import { useAnalyticsTrack } from '../../utils/analytics';
import { useSignin } from '../../utils/user';
import type { ValidateEmailAndLogin } from '@nangohq/types';
import { toast } from 'react-toastify';
import { useStore } from '../../store';
import { apiFetch } from '../../utils/api';

export const EmailVerified: React.FC = () => {
    const [loaded, setLoaded] = useState(false);
    const { token } = useParams<{ token: string }>();
    const signin = useSignin();
    const navigate = useNavigate();
    const analyticsTrack = useAnalyticsTrack();

    const env = useStore((state) => state.env);

    useEffect(() => {
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
                        toast.error(errorResponse.error.message, { position: toast.POSITION.BOTTOM_CENTER });
                        navigate(`/verify-email/expired/${token}`);
                        return;
                    }
                    toast.error(response.error.message || 'Issue verifying email. Please try again.', { position: toast.POSITION.BOTTOM_CENTER });
                } else {
                    const user: ValidateEmailAndLogin['Success']['user'] = response['user'];
                    analyticsTrack('web:account_signup', {
                        user_id: user.id,
                        email: user.email,
                        name: user.name,
                        accountId: user.accountId
                    });

                    signin(user);
                    toast.success('Email verified successfully!', { position: toast.POSITION.BOTTOM_CENTER });
                    navigate(`/${env}/getting-started`);
                }
            } catch {
                toast.error('An error occurred while verifying the email. Please try again.', { position: toast.POSITION.BOTTOM_CENTER });
            } finally {
                setLoaded(true);
            }
        };

        void verifyEmail();
    }, [token, navigate, env, signin, analyticsTrack]);

    return !loaded ? <Loading spaceRatio={2.5} className="-top-36" /> : null;
};
