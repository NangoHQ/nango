import { useState } from 'react';
import { toast } from 'react-toastify';

import { useRequestPasswordResetAPI } from '../../utils/api';
import DefaultLayout from '../../layout/DefaultLayout';

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
            <DefaultLayout>
                <div className="flex flex-col justify-center">
                    <div className="w-80">
                        <h2 className="mt-4 text-center text-[20px] text-white">Request password reset</h2>
                        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
                            <div>
                                <div>
                                    <div className="mt-1">
                                        <input
                                            id="email"
                                            name="email"
                                            type="email"
                                            placeholder="Email"
                                            autoComplete="email"
                                            required
                                            className="border-border-gray bg-dark-600 placeholder-dark-500 text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-[14px] placeholder-gray-400 shadow-sm focus:outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid">
                                <button
                                    type="submit"
                                    className="bg-white flex h-11 justify-center rounded-md border px-4 pt-3 text-[14px] text-black shadow active:ring-2 active:ring-offset-2"
                                >
                                    Send password reset email
                                </button>
                                {serverErrorMessage && <p className="mt-6 place-self-center text-sm text-red-600">{serverErrorMessage}</p>}
                            </div>
                        </form>
                    </div>
                </div>
            </DefaultLayout>
        </>
    );
}
