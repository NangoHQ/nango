import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { apiFetch, useSigninAPI } from '../../utils/api';
import { useSignin } from '../../utils/user';
import type { ApiUser, PostSignin } from '@nangohq/types';
import DefaultLayout from '../../layout/DefaultLayout';
import GoogleButton from '../../components/ui/button/Auth/Google';
import { Button } from '../../components/ui/button/Button';
import { globalEnv } from '../../utils/env';
import { Helmet } from 'react-helmet';

export default function Signin() {
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [showResendEmail, setShowResendEmail] = useState(false);
    const [email, setEmail] = useState('');
    const navigate = useNavigate();
    const signin = useSignin();
    const signinAPI = useSigninAPI();

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setServerErrorMessage('');
        setShowResendEmail(false);

        const target = e.target as typeof e.target & {
            email: { value: string };
            password: { value: string };
        };

        const res = await signinAPI(target.email.value, target.password.value);

        if (res?.status === 200) {
            const data = await res.json();
            const user: ApiUser = data['user'];
            signin(user);
            navigate('/');
        } else if (res?.status === 401) {
            setServerErrorMessage('Invalid email or password.');
        } else if (res?.status === 400) {
            const errorResponse: PostSignin['Errors'] = (await res.json()) as PostSignin['Errors'];
            if (errorResponse.error.code === 'email_not_verified') {
                setShowResendEmail(true);
                setEmail(target.email.value);
                setServerErrorMessage('Please verify your email before logging in.');
            } else {
                setServerErrorMessage('Issue logging in. Please try again.');
            }
        }
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
            <Helmet>
                <title>Login - Nango</title>
            </Helmet>
            <div className="flex flex-col justify-center">
                <div className="flex flex-col justify-center w-80 mx-4">
                    <h2 className="mt-4 text-center text-[20px] text-white">Log in to Nango</h2>
                    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                        <div>
                            <div className="mt-1">
                                <input
                                    id="email"
                                    placeholder="Email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    className="border-border-gray bg-dark-600 text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-[14px] placeholder-gray-400 shadow-sm focus:outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-end">
                                <div className="flex flex-end text-sm">
                                    <Link to="/forgot-password" className="text-dark-500 text-xs ml-1">
                                        Forgot your password?
                                    </Link>
                                </div>
                            </div>
                            <div className="mt-2">
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    placeholder="Password"
                                    autoComplete="current-password"
                                    required
                                    className="border-border-gray bg-dark-600 text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-[14px] placeholder-gray-400 shadow-sm focus:outline-none"
                                />
                            </div>
                        </div>

                        <div className="grid">
                            <button
                                type="submit"
                                className="bg-white mt-4 flex h-11 justify-center rounded-md border px-4 pt-3 text-[14px] text-black shadow hover:border-2 active:ring-2 active:ring-offset-2"
                            >
                                Log in
                            </button>
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

                        {globalEnv.features.managedAuth && (
                            <>
                                <div className="flex items-center justify-center my-4 text-xs">
                                    <div className="border-t border-gray-600 flex-grow mr-7"></div>
                                    <span className="text-dark-500">or continue with</span>
                                    <div className="border-t border-gray-600 flex-grow ml-7"></div>
                                </div>

                                <GoogleButton text="Sign in with Google" setServerErrorMessage={setServerErrorMessage} />
                            </>
                        )}
                    </form>
                </div>
                <div className="grid text-xs">
                    <div className="mt-7 flex place-self-center">
                        <p className="text-dark-500">Don&apos;t have an account?</p>
                        <Link to="/signup" className="text-white ml-1">
                            Sign up.
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
