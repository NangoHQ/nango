import { useState } from 'react';
import { toast } from 'react-toastify';

import { useRequestPasswordResetAPI } from '../../utils/api';
import DefaultLayout from '../../layout/DefaultLayout';
import { Input } from '../../components/ui/input/Input';
import { Button } from '../../components/ui/button/Button';
import { Helmet } from 'react-helmet';

export default function Signin() {
    const requestPasswordResetAPI = useRequestPasswordResetAPI();

    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setServerErrorMessage('');
        setLoading(true);

        const res = await requestPasswordResetAPI(email);

        if (res?.status === 200) {
            toast.success('Email sent!', { position: toast.POSITION.BOTTOM_CENTER });
            setDone(true);
        } else if (res?.status === 400) {
            setServerErrorMessage('No user matching this email.');
        } else {
            setServerErrorMessage('Unknown error...');
        }
        setLoading(false);
    };

    return (
        <DefaultLayout>
            <Helmet>
                <title>Forgot Password - Nango</title>
            </Helmet>
            <div className="flex flex-col justify-center">
                <div className="w-80 flex flex-col gap-6">
                    <h2 className="mt-4 text-center text-[20px] text-white">Request password reset</h2>
                    {!done ? (
                        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                autoFocus
                                placeholder="Email"
                                autoComplete="email"
                                required
                                inputSize="lg"
                                onChange={(e) => setEmail(e.target.value)}
                                className="border-border-gray bg-dark-600"
                            />

                            <div className="grid">
                                <Button type="submit" className="justify-center" size={'lg'} isLoading={loading}>
                                    Send password reset email
                                </Button>
                                {serverErrorMessage && <p className="place-self-center text-sm text-red-600">{serverErrorMessage}</p>}
                            </div>
                        </form>
                    ) : (
                        <div className="text-text-light-gray text-sm text-center">Email sent to {email}</div>
                    )}
                </div>
            </div>
        </DefaultLayout>
    );
}
