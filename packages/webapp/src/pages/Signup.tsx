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

    const googleLogin = async () => {
        analyticsTrack('web:account_signup_google');
        const res = await fetch('/api/v1/hosted/signup?provider=GoogleOAuth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (res?.status === 200) {
            const data = await res.json();
            const { url } = data;
            window.location = url;
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
                                        autoComplete="new-password"
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
                        <p className="my-7 text-sm text-text-light-gray text-center">or sign up with</p>
                        <div className="space-x-6 flex justify-center">
                            <button type="button" className="border-none outline-none" onClick={googleLogin}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="30px" className="inline" viewBox="0 0 512 512">
                                    <path
                                        fill="#fbbd00"
                                        d="M120 256c0-25.367 6.989-49.13 19.131-69.477v-86.308H52.823C18.568 144.703 0 198.922 0 256s18.568 111.297 52.823 155.785h86.308v-86.308C126.989 305.13 120 281.367 120 256z"
                                        data-original="#fbbd00"
                                    />
                                    <path
                                        fill="#0f9d58"
                                        d="m256 392-60 60 60 60c57.079 0 111.297-18.568 155.785-52.823v-86.216h-86.216C305.044 385.147 281.181 392 256 392z"
                                        data-original="#0f9d58"
                                    />
                                    <path
                                        fill="#31aa52"
                                        d="m139.131 325.477-86.308 86.308a260.085 260.085 0 0 0 22.158 25.235C123.333 485.371 187.62 512 256 512V392c-49.624 0-93.117-26.72-116.869-66.523z"
                                        data-original="#31aa52"
                                    />
                                    <path
                                        fill="#3c79e6"
                                        d="M512 256a258.24 258.24 0 0 0-4.192-46.377l-2.251-12.299H256v120h121.452a135.385 135.385 0 0 1-51.884 55.638l86.216 86.216a260.085 260.085 0 0 0 25.235-22.158C485.371 388.667 512 324.38 512 256z"
                                        data-original="#3c79e6"
                                    />
                                    <path
                                        fill="#cf2d48"
                                        d="m352.167 159.833 10.606 10.606 84.853-84.852-10.606-10.606C388.668 26.629 324.381 0 256 0l-60 60 60 60c36.326 0 70.479 14.146 96.167 39.833z"
                                        data-original="#cf2d48"
                                    />
                                    <path
                                        fill="#eb4132"
                                        d="M256 120V0C187.62 0 123.333 26.629 74.98 74.98a259.849 259.849 0 0 0-22.158 25.235l86.308 86.308C162.883 146.72 206.376 120 256 120z"
                                        data-original="#eb4132"
                                    />
                                </svg>
                            </button>
                        </div>
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
