import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useSigninAPI } from '../utils/api';
import { useSignin, User } from '../utils/user';
import DefaultLayout from '../layout/DefaultLayout';

export default function Signin() {
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const navigate = useNavigate();
    const signin = useSignin();
    const signinAPI = useSigninAPI();

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setServerErrorMessage('');

        const target = e.target as typeof e.target & {
            email: { value: string };
            password: { value: string };
        };

        const res = await signinAPI(target.email.value, target.password.value);

        if (res?.status === 200) {
            const data = await res.json();
            const user: User = data['user'];
            signin(user);
            navigate('/');
        } else if (res?.status === 401) {
            setServerErrorMessage('Invalid email or password.');
        }
    };

    return (
        <>
            <DefaultLayout>
                <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md">
                    <div className="bg-bg-dark-gray py-8 px-4 shadow sm:rounded-lg sm:px-10">
                        <h2 className="mt-2 text-center text-3xl font-semibold tracking-tight text-white">Sign in</h2>
                        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
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
                                <div className="flex justify-between">
                                    <div className="flex text-sm">
                                        <label htmlFor="password" className="text-text-light-gray block text-sm font-semibold">
                                            Password
                                        </label>
                                    </div>
                                    <div className="flex text-sm">
                                        <a href="/forgot-password" className="text-text-blue hover:text-text-light-blue ml-1">
                                            Forgot your password?
                                        </a>
                                    </div>
                                </div>
                                <div className="mt-1">
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        autoComplete="current-password"
                                        required
                                        className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            <div className="grid">
                                <button
                                    type="submit"
                                    className="border-border-blue bg-bg-dark-blue active:ring-border-blue mt-4 flex h-12 place-self-center rounded-md border px-4 pt-3 text-base font-semibold text-blue-500 shadow-sm hover:border-2 active:ring-2 active:ring-offset-2"
                                >
                                    Sign in
                                </button>
                                {serverErrorMessage && <p className="mt-6 place-self-center text-sm text-red-600">{serverErrorMessage}</p>}
                            </div>
                        </form>
                    </div>
                    <div className="grid">
                        <div className="mt-4 flex place-self-center text-sm">
                            <p className="text-text-light-gray">Need an account?</p>
                            <Link to="/signup" className="text-text-blue hover:text-text-light-blue ml-1">
                                Sign up
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
