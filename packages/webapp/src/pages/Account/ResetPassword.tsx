import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import { useResetPasswordAPI } from '../../utils/api';
import DefaultLayout from '../../layout/DefaultLayout';

export default function ResetPassword() {
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
            <DefaultLayout>
                <div className="flex flex-col justify-center">
                    <div className="w-80">
                        <h2 className="mt-4 text-center text-[20px] text-white">Reset password</h2>
                        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
                            <div>
                                <div className="mt-1">
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        placeholder="Password"
                                        autoComplete="new-password"
                                        required
                                        className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            <div className="grid">
                                <button
                                    type="submit"
                                    className="bg-white flex h-11 justify-center rounded-md border px-4 pt-3 text-[14px] text-black shadow active:ring-2 active:ring-offset-2"
                                >
                                    Reset
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
