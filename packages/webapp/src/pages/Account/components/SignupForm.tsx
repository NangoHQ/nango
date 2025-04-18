import { useState } from 'react';
import type { ApiInvitation, PostSignup } from '@nangohq/types';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, useSignupAPI } from '../../../utils/api';
import GoogleButton from '../../../components/ui/button/Auth/Google';
import { Button } from '../../../components/ui/button/Button';
import { Input } from '../../../components/ui/input/Input';
import { Password } from './Password';
import { globalEnv } from '../../../utils/env';

export const SignupForm: React.FC<{ invitation?: ApiInvitation; token?: string }> = ({ invitation, token }) => {
    const navigate = useNavigate();
    const signupAPI = useSignupAPI();

    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [showResendEmail, setShowResendEmail] = useState(false);
    const [email, setEmail] = useState(() => invitation?.email || '');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [passwordStrength, setPasswordStrength] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setServerErrorMessage('');
        setShowResendEmail(false);
        setLoading(true);

        const res = await signupAPI({ name, email, password, token });

        if (res?.status === 200) {
            const response: PostSignup['Success'] = await res.json();
            const {
                data: { uuid, verified }
            } = response;

            if (!verified) {
                navigate(`/verify-email/${uuid}`);
            } else {
                navigate('/');
            }
        } else {
            const errorResponse: PostSignup['Errors'] = await res?.json();
            if (errorResponse.error.code === 'email_not_verified') {
                setShowResendEmail(true);
            }
            setServerErrorMessage(errorResponse?.error?.message || 'Issue signing up. Please try again.');
        }
        setLoading(false);
    };

    const resendVerificationEmail = async () => {
        setShowResendEmail(false);
        setServerErrorMessage('');

        const res = await apiFetch('/api/v1/account/resend-verification-email/by-email', {
            method: 'POST',
            body: JSON.stringify({
                email
            })
        });

        if (res?.status === 200) {
            setServerErrorMessage('Verification email sent.');
        } else {
            setServerErrorMessage('Issue sending verification email. Please try again.');
        }
    };

    return (
        <>
            <div className="flex flex-col justify-center">
                <h2 className="mt-4 text-center text-[20px] text-white">Sign up to Nango</h2>
                <form className="mt-6 flex flex-col gap-6" onSubmit={handleSubmit}>
                    <div className="flex flex-col gap-6">
                        <Input
                            id="name"
                            name="name"
                            type="text"
                            autoComplete="name"
                            autoFocus
                            minLength={1}
                            placeholder="Name"
                            maxLength={100}
                            inputSize="lg"
                            value={name}
                            required
                            onChange={(e) => setName(e.target.value)}
                            className="border-border-gray bg-dark-600"
                        />

                        <Input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            placeholder="Email"
                            inputSize="lg"
                            value={email}
                            required
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={Boolean(invitation?.email)}
                            className="border-border-gray bg-dark-600"
                        />

                        <Password
                            setPassword={(tmpPass, tmpStrength) => {
                                setPassword(tmpPass);
                                setPasswordStrength(tmpStrength);
                            }}
                        />
                    </div>

                    <div className="grid">
                        <Button
                            type="submit"
                            size={'lg'}
                            className="justify-center disabled:bg-dark-700"
                            disabled={!name || !email || !password || !passwordStrength}
                            isLoading={loading}
                        >
                            Sign up
                        </Button>
                        {serverErrorMessage && (
                            <>
                                <p className="mt-6 place-self-center text-sm text-red-600">{serverErrorMessage}</p>
                                {showResendEmail && (
                                    <Button onClick={resendVerificationEmail} className="flex justify-center mt-2 text-light-gray" variant="danger">
                                        Resend verification email
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </form>
                {globalEnv.features.managedAuth && (
                    <>
                        <div className="flex items-center justify-center my-4 text-xs">
                            <div className="border-t border-gray-600 flex-grow mr-7"></div>
                            <span className="text-dark-500">or continue with</span>
                            <div className="border-t border-gray-600 flex-grow ml-7"></div>
                        </div>
                        <GoogleButton text="Sign up with Google" setServerErrorMessage={setServerErrorMessage} token={token} />
                    </>
                )}
            </div>
            <div className="grid text-xs">
                <div className="mt-7 flex place-self-center">
                    <p className="text-dark-500">Already have an account?</p>
                    <Link to="/signin" className="text-white ml-1">
                        Sign in.
                    </Link>
                </div>
            </div>
        </>
    );
};
