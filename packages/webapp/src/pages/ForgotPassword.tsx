import { useState } from 'react';
import { toast } from 'react-toastify';

import { useRequestPasswordResetAPI } from '../utils/api';

export default function Signin() {
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const requestPasswordResetAPI = useRequestPasswordResetAPI();

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setServerErrorMessage('');

        const target = e.target as typeof e.target & {
            email: { value: string };
        };

        const res = await requestPasswordResetAPI(target.email.value);

        if (res?.status === 200) {
            toast.success('Email sent!', { position: toast.POSITION.BOTTOM_CENTER });
        } else if (res?.status === 404) {
            setServerErrorMessage('No user matching this email.');
        } else {
            setServerErrorMessage('Unknown error...');
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
                        <h2 className="mt-2 text-center text-3xl font-semibold tracking-tight text-white">Request Password Reset</h2>
                        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
                            <div>
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
                            </div>

                            <div className="grid">
                                <button
                                    type="submit"
                                    className="border-border-blue bg-bg-dark-blue active:ring-border-blue mt-4 flex h-12 place-self-center rounded-md border px-4 pt-3 text-base font-semibold text-blue-500 shadow-sm hover:border-2 active:ring-2 active:ring-offset-2"
                                >
                                    Send Password Reset Email
                                </button>
                                {serverErrorMessage && <p className="mt-6 place-self-center text-sm text-red-600">{serverErrorMessage}</p>}
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
}
