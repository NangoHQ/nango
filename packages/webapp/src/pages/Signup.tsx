import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAnalyticsTrack } from '../utils/analytics';
import { MANAGED_AUTH_ENABLED } from '../utils/utils';
import { useSignupAPI } from '../utils/api';
import type { User } from '../utils/user';
import { useSignin } from '../utils/user';
import DefaultLayout from '../layout/DefaultLayout';
import GoogleButton from '../components/ui/button/Auth/Google';

export default function Signup() {
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const navigate = useNavigate();
    const signin = useSignin();
    const signupAPI = useSignupAPI();
    const analyticsTrack = useAnalyticsTrack();

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setServerErrorMessage('');

        const target = e.target as typeof e.target & {
            name: { value: string };
            email: { value: string };
            password: { value: string };
        };

        const res = await signupAPI(target.name.value, target.email.value, target.password.value);

        if (res?.status === 200) {
            const data = await res.json();
            const user: User = data['user'];
            analyticsTrack('web:account_signup', {
                user_id: user.id,
                email: user.email,
                name: user.name,
                accountId: user.accountId
            });
            signin(user);
            navigate('/');
        } else if (res != null) {
            const errorMessage = (await res.json()).error;
            setServerErrorMessage(errorMessage);
        }
    };

    return (
        <>
            <DefaultLayout>
                <div className="flex flex-col justify-center">
                    <div className="flex flex-col justify-center w-80 mx-4">
                        <h2 className="mt-4 text-center text-[20px] text-white">Sign up to Nango</h2>
                        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
                            <div>
                                <div className="mt-1">
                                    <input
                                        id="name"
                                        name="name"
                                        type="text"
                                        autoComplete="name"
                                        required
                                        minLength={1}
                                        placeholder="Name"
                                        maxLength={100}
                                        className="border-border-gray bg-dark-600 placeholder-dark-500 text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-[14px] placeholder-gray-400 shadow-sm focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="mt-1">
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        placeholder="Email"
                                        required
                                        className="border-border-gray bg-dark-600 placeholder-dark-500 text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-[14px] placeholder-gray-400 shadow-sm focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="mt-1">
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        autoComplete="new-password"
                                        placeholder="Password"
                                        required
                                        minLength={8}
                                        maxLength={50}
                                        className="border-border-gray bg-dark-600 placeholder-dark-500 text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-[14px] placeholder-gray-400 shadow-sm focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div className="grid">
                                <button
                                    type="submit"
                                    className="bg-white flex h-11 justify-center rounded-md border px-4 pt-3 text-[14px] text-black shadow hover:border-2 active:ring-2 active:ring-offset-2"
                                >
                                    Sign up
                                </button>
                                {serverErrorMessage && <p className="mt-6 place-self-center text-sm text-red-600">{serverErrorMessage}</p>}
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
        </>
    );
}
