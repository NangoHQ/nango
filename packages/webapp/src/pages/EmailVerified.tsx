import { useEffect } from 'react';
import { Loading } from '@geist-ui/core';
import { useParams, useNavigate } from 'react-router-dom';
import { useAnalyticsTrack } from '../utils/analytics';
import { useSignin } from '../utils/user';
import type { User } from '../utils/user';
import { toast } from 'react-toastify';
import { useStore } from '../store';

export const EmailVerified: React.FC = () => {
    const { token } = useParams();
    const signin = useSignin();
    const navigate = useNavigate();
    const analyticsTrack = useAnalyticsTrack();

    const env = useStore((state) => state.env);

    useEffect(() => {
        const verifyEmail = async () => {
            const res = await fetch(`/api/v1/account/verify/code`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token
                })
            });

            const response = await res.json();

            if (res?.status !== 200) {
                toast.error(response.error.message || 'Issue verifying email. Please try again.', { position: toast.POSITION.BOTTOM_CENTER });
                return;
            } else {
                const user: User = response['user'];
                analyticsTrack('web:account_signup', {
                    user_id: user.id,
                    email: user.email,
                    name: user.name,
                    accountId: user.accountId
                });

                signin(user);
                toast.success('Email verified successfully!', { position: toast.POSITION.BOTTOM_CENTER });
                navigate(`/${env}/integrations`);
            }
        };

        verifyEmail();
    }, [token, navigate, env, signin, analyticsTrack]);

    return <Loading spaceRatio={2.5} className="-top-36" />;
};
