import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import { useResetPasswordAPI } from '../../utils/api';
import DefaultLayout from '../../layout/DefaultLayout';
import { Password } from './components/Password';
import { Button } from '../../components/ui/button/Button';
import { Helmet } from 'react-helmet';

export default function ResetPassword() {
    const resetPasswordAPI = useResetPasswordAPI();
    const navigate = useNavigate();
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const { token } = useParams();
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [passwordStrength, setPasswordStrength] = useState(false);

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setServerErrorMessage('');
        setLoading(true);

        const res = await resetPasswordAPI(token!, password);

        if (res?.status === 200) {
            toast.success('Password updated!', { position: toast.POSITION.BOTTOM_CENTER });
            navigate('/');
        } else if (res?.status === 400) {
            setServerErrorMessage('Your reset token is invalid or expired.');
        } else {
            setServerErrorMessage('Unkown error...');
        }
        setLoading(false);
    };

    if (!token) {
        return null;
    }

    return (
        <DefaultLayout>
            <Helmet>
                <title>Reset Password - Nango</title>
            </Helmet>
            <div className="flex flex-col justify-center">
                <div className="w-80 flex flex-col gap-4">
                    <h2 className="text-center text-[20px] text-white">Reset password</h2>
                    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
                        <Password
                            setPassword={(tmpPass, tmpStrength) => {
                                setPassword(tmpPass);
                                setPasswordStrength(tmpStrength);
                            }}
                            autoFocus
                        />

                        <div className="grid">
                            <Button type="submit" size={'lg'} className="justify-center" disabled={!password || !passwordStrength} isLoading={loading}>
                                Reset
                            </Button>
                            {serverErrorMessage && <p className="mt-6 place-self-center text-sm text-red-600">{serverErrorMessage}</p>}
                        </div>
                    </form>
                </div>
            </div>
        </DefaultLayout>
    );
}
