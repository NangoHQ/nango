import { Loading } from '@geist-ui/core';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import DefaultLayout from '../../layout/DefaultLayout';
import { apiFetch } from '../../utils/api';

import type { GetEmailByExpiredToken, ResendVerificationEmailByUuid } from '@nangohq/types';

export function VerifyEmailByExpiredToken() {
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [email, setEmail] = useState('');
    const [uuid, setUuid] = useState('');
    const [loaded, setLoaded] = useState(false);
    const navigate = useNavigate();

    const { token } = useParams();

    useEffect(() => {
        if (!token) {
            navigate('/');
        }
    }, [token, navigate]);

    useEffect(() => {
        const getEmail = async () => {
            const res = await apiFetch(`/api/v1/account/email/expired-token/${token}`);

            if (res?.status === 200) {
                const response: GetEmailByExpiredToken['Success'] = (await res.json()) as GetEmailByExpiredToken['Success'];
                const { email, verified, uuid } = response;

                setUuid(uuid);

                if (verified) {
                    toast.success('Email already verified. Routing to the login page', { position: toast.POSITION.BOTTOM_CENTER });
                    navigate('/signin');
                }
                setEmail(email);
            } else {
                const errorResponse: GetEmailByExpiredToken['Errors'] = (await res.json()) as GetEmailByExpiredToken['Errors'];
                setServerErrorMessage(errorResponse.error.message || 'Issue verifying email. Please try again.');
            }
            setLoaded(true);
        };

        if (!loaded) {
            getEmail();
        }
    }, [token, loaded, setLoaded, navigate]);

    const resendEmail = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setServerErrorMessage('');

        const res = await apiFetch('/api/v1/account/resend-verification-email/by-uuid', {
            method: 'POST',
            body: JSON.stringify({
                uuid
            })
        });

        if (res?.status === 200) {
            toast.success('Verification email sent again!', { position: toast.POSITION.BOTTOM_CENTER });
        } else {
            const response: ResendVerificationEmailByUuid['Errors'] = await res.json();
            setServerErrorMessage(response.error.message || 'Unkown error...');
        }
    };

    if (!loaded) {
        return <Loading spaceRatio={2.5} className="-top-36" />;
    }
    return (
        <>
            <DefaultLayout>
                <div className="flex flex-col justify-center items-center">
                    <div className="py-3">
                        <h2 className="mt-4 text-center text-[20px] text-white">Verify your email</h2>
                        {email || uuid ? (
                            <form className="mt-6 space-y-6" onSubmit={resendEmail}>
                                <span className="text-text-light-gray mb-4 text-[14px]">Check {email} to verify your account and get started.</span>
                                <div className="flex justify-center">
                                    <button className="min-w-8 bg-white flex h-11 justify-center rounded-md border px-4 pt-3 text-[14px] text-black shadow-sm active:ring-2 active:ring-offset-2">
                                        Resend verification email
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <span className="flex text-text-light-gray mb-4 text-[14px] mt-6">Invalid user id. Please try and signup again.</span>
                        )}
                        {serverErrorMessage && <p className="mt-6 place-self-center text-sm text-red-600">{serverErrorMessage}</p>}
                    </div>
                </div>
            </DefaultLayout>
        </>
    );
}
