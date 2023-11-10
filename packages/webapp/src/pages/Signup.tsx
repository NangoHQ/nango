import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAnalyticsTrack } from '../utils/analytics';
import { useSignupAPI } from '../utils/api';
import { useSignin, User } from '../utils/user';
import DefaultLayout from '../layout/DefaultLayout';

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
            let data = await res.json();
            let user: User = data['user'];
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
                <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md">
                    <div className="bg-bg-dark-gray py-8 px-4 shadow sm:rounded-lg sm:px-10">
                        <h2 className="mt-2 text-center text-3xl font-semibold tracking-tight text-white">Sign up</h2>
                        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
                            <div>
                                <label htmlFor="name" className="text-text-light-gray block text-sm font-semibold">
                                    Name
                                </label>
                                <div className="mt-1">
                                    <input
                                        id="name"
                                        name="name"
                                        type="text"
                                        autoComplete="name"
                                        required
                                        minLength={1}
                                        maxLength={100}
                                        className="border-border-gray bg-bg-black text-text-light-gray focus:border-blue focus:ring-blue block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                    Email
                                </label>
                                <div className="mt-1">
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        required
                                        className="border-border-gray bg-bg-black text-text-light-gray focus:ring-blue block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="password" className="text-text-light-gray block text-sm font-semibold">
                                    Password
                                </label>
                                <div className="mt-1">
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        autoComplete="current-password"
                                        required
                                        minLength={8}
                                        maxLength={50}
                                        className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            <div className="grid">
                                <button
                                    type="submit"
                                    className="border-border-blue bg-bg-dark-blue active:ring-border-blue mt-4 flex h-12 place-self-center rounded-md border px-4 pt-3 text-base font-semibold text-blue-500 shadow-sm hover:border-2 active:ring-2 active:ring-offset-2"
                                >
                                    Sign up
                                </button>
                                {serverErrorMessage && <p className="mt-6 place-self-center text-sm text-red-600">{serverErrorMessage}</p>}
                            </div>
                        </form>
                    </div>
                    <div className="grid">
                        <div className="mt-4 flex place-self-center text-sm">
                            <p className="text-text-light-gray">Already have an account?</p>
                            <Link to="/signin" className="text-text-blue hover:text-text-light-blue ml-1">
                                Sign in
                            </Link>
                        </div>
                    </div>
                    <div className="grid">
                        <div className="mt-4 flex place-self-center text-sm">
                            <p className="text-text-light-gray">By signing up, you agree to our</p>
                            <a href="https://www.nango.dev/terms" target="_blank" rel="noreferrer" className="text-text-blue hover:text-text-light-blue ml-1">
                                Terms of Service
                            </a>
                            <p className="text-text-light-gray ml-1">and</p>
                            <a
                                href="https://www.nango.dev/privacy-policy"
                                target="_blank"
                                rel="noreferrer"
                                className="text-text-blue hover:text-text-light-blue ml-1"
                            >
                                Privacy Policy
                            </a>
                            <p className="text-text-light-gray">.</p>
                        </div>
                    </div>
                </div>
            </DefaultLayout>
        </>
    );
}
