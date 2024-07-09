import { useState } from 'react';
import type { Signup } from '@nangohq/types';
import { Link, useNavigate } from 'react-router-dom';
import { MANAGED_AUTH_ENABLED } from '../../utils/utils';
import { apiFetch, useSignupAPI } from '../../utils/api';
import DefaultLayout from '../../layout/DefaultLayout';
import GoogleButton from '../../components/ui/button/Auth/Google';
import Button from '../../components/ui/button/Button';
import { Input } from '../../components/ui/input/Input';
import { Password } from './components/Password';

export default function Signup() {
    const navigate = useNavigate();
    const signupAPI = useSignupAPI();

    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [showResendEmail, setShowResendEmail] = useState(false);
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [passwordStrength, setPasswordStrength] = useState(0);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setServerErrorMessage('');
        setShowResendEmail(false);
        setLoading(true);

        const res = await signupAPI(name, email, password);

        if (res?.status === 200) {
            const response: Signup['Success'] = await res.json();
            const { uuid } = response;

            navigate(`/verify-email/${uuid}`);
        } else {
            const errorResponse: Signup['Errors'] = await res?.json();
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
        <DefaultLayout>
            <div className="flex flex-col justify-center">
                <div className="flex flex-col justify-center w-80 mx-4">
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
                                className="justify-center"
                                disabled={!name || !email || !password || passwordStrength < 100}
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
                    {MANAGED_AUTH_ENABLED && (
                        <>
                            <div className="flex items-center justify-center my-4 text-xs">
                                <div className="border-t border-gray-600 flex-grow mr-7"></div>
                                <span className="text-dark-500">or continue with</span>
                                <div className="border-t border-gray-600 flex-grow ml-7"></div>
                            </div>
                            <GoogleButton text="Sign up with Google" setServerErrorMessage={setServerErrorMessage} />
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
                <div className="grid w-full">
                    <div className="mt-8 flex text-xs">
                        <p className="text-dark-500">
                            By signing in, you agree to our
                            <a href="https://www.nango.dev/terms" target="_blank" rel="noreferrer" className="text-white ml-1">
                                Terms of Service
                            </a>
                            <span className="text-dark-500 ml-1">and</span>
                            <a href="https://www.nango.dev/privacy-policy" target="_blank" rel="noreferrer" className="text-white ml-1">
                                Privacy Policy
                            </a>
                            <span className="text-dark-500">.</span>
                        </p>
                    </div>
                </div>
            </div>
        </DefaultLayout>
    );
}
