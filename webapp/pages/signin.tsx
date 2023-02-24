import { useRouter } from 'next/router';
import { useState } from 'react';

export default function Signin() {
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const router = useRouter();

    const handleSubmit = async (event: any) => {
        event.preventDefault();
        setServerErrorMessage('');

        const data = {
            email: event.target.email.value,
            password: event.target.password.value
        };

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data),
            credentials: 'include' as RequestCredentials
        };

        try {
            const res = await fetch('http://localhost:3003/login', options);

            if (res.status === 200) {
                router.push('/home');
            } else if (res.status === 401) {
                setServerErrorMessage('Invalid email or password.');
            } else {
                setServerErrorMessage('Unkown error.');
            }
        } catch (e) {
            setServerErrorMessage('Unkown error.');
        }
    };

    return (
        <>
            <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8">
                <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md">
                    <img className="mx-auto h-20 w-auto" src="/logo-dark-background-vertical.svg" alt="Your Company" />
                </div>

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
                                    {/* <div className="flex text-sm">
                                        <a href="/verify-email" className="text-text-blue hover:text-text-light-blue ml-1">
                                            Forgot your password?
                                        </a>
                                    </div> */}
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
                            <a href="/signup" className="text-text-blue hover:text-text-light-blue ml-1">
                                Sign up
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
