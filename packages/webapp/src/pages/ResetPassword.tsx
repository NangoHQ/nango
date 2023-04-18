import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import { useResetPasswordAPI } from '../utils/api';

export default function Signin() {
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const navigate = useNavigate();
    const { token } = useParams();
    const resetPasswordAPI = useResetPasswordAPI();

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setServerErrorMessage('');

        const target = e.target as typeof e.target & {
            password: { value: string };
        };

        if (!token) {
            setServerErrorMessage('Invalid reset token.');
            return;
        }

        const res = await resetPasswordAPI(token, target.password.value);

        if (res?.status === 200) {
            toast.success('Password updated!', { position: toast.POSITION.BOTTOM_CENTER });
            navigate('/');
        } else if (res?.status === 404) {
            setServerErrorMessage('Your reset token is invalid or expired.');
        } else {
            setServerErrorMessage('Unkown error...');
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
                        <h2 className="mt-2 text-center text-3xl font-semibold tracking-tight text-white">Reset Password</h2>
                        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
                            <div>
                                <div className="flex justify-between">
                                    <div className="flex text-sm">
                                        <label htmlFor="password" className="text-text-light-gray block text-sm font-semibold">
                                            New Password
                                        </label>
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
                                    Reset
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
