import { useEffect, useState } from 'react';
import Spinner from '../components/ui/Spinner';
import { Navigate, useNavigate } from 'react-router-dom';
import { useSignupAPI } from '../utils/api';
import { useAnalyticsTrack } from '../utils/analytics';
import { useSignin } from '../utils/user';
import type { User } from '../utils/user';

export const HNDemo: React.FC = () => {
    const [isAnUser, setIsAnUser] = useState<null | boolean>(null);
    const navigate = useNavigate();
    const signupAPI = useSignupAPI();
    const signin = useSignin();
    const analyticsTrack = useAnalyticsTrack();

    useEffect(() => {
        async function getMeta() {
            const res = await fetch('/api/v1/meta');
            if (res.status !== 200) {
                setIsAnUser(false);
                return;
            }
            setIsAnUser(true);
        }
        void getMeta();
    }, []);

    useEffect(() => {
        if (isAnUser === null || isAnUser) {
            return;
        }
        async function signup() {
            const id = Math.random().toString(36).replace('0.', '');
            const res = await signupAPI(`demo-${id}`, `demo-${id}@example.com`, Math.random().toString(36));

            if (res?.status === 200) {
                const { user } = (await res.json()) as { user: User };
                analyticsTrack('web:account_signup', {
                    user_id: user.id,
                    email: user.email,
                    name: user.name,
                    accountId: user.accountId
                });
                signin(user);
                navigate('/');
            }
        }

        void signup();
    }, [isAnUser, signin, navigate, analyticsTrack, signupAPI]);

    if (isAnUser) {
        return <Navigate to="/dev/interactive-demo" replace />;
    }

    return (
        <div className="w-screen h-screen flex justify-center items-center">
            <div className="text-white">
                <Spinner size={1} />
            </div>
        </div>
    );
};
