import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Spinner } from '@/components/ui/Spinner';
import { useEmailByExpiredToken, useResendVerificationEmailByUuid } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import DefaultLayout from '../../layout/DefaultLayout';
import { APIError } from '../../utils/api';

import type { GetEmailByExpiredToken, ResendVerificationEmailByUuid } from '@nangohq/types';

export function VerifyEmailByExpiredToken() {
    const [resendErrorMessage, setResendErrorMessage] = useState('');
    const navigate = useNavigate();
    const { toast } = useToast();

    const { token } = useParams();
    const { data, error, isLoading } = useEmailByExpiredToken(token);
    const { mutateAsync: resendVerificationEmail } = useResendVerificationEmailByUuid();

    const email = data?.email ?? '';
    const uuid = data?.uuid ?? '';
    const lookupErrorMessage = error ? (error.json as GetEmailByExpiredToken['Errors']).error?.message || 'Issue verifying email. Please try again.' : '';
    const serverErrorMessage = resendErrorMessage || lookupErrorMessage;

    useEffect(() => {
        if (!token) {
            navigate('/');
        }
    }, [token, navigate]);

    useEffect(() => {
        if (data?.verified) {
            toast({ variant: 'success', title: 'Email already verified. Routing to the login page' });
            navigate('/signin');
        }
    }, [data?.verified, navigate, toast]);

    const resendEmail = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setResendErrorMessage('');

        try {
            await resendVerificationEmail({ uuid });
            toast({ variant: 'success', title: 'Verification email sent again!' });
        } catch (err) {
            const response = err instanceof APIError ? (err.json as ResendVerificationEmailByUuid['Errors']) : undefined;
            setResendErrorMessage(response?.error?.message || 'Unkown error...');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Spinner />
            </div>
        );
    }
    return (
        <>
            <DefaultLayout>
                <div className="flex flex-col justify-center items-center">
                    <div className="py-3">
                        <h2 className="mt-4 text-center text-[20px] text-text-strong">Verify your email</h2>
                        {email || uuid ? (
                            <form className="mt-6 space-y-6" onSubmit={resendEmail}>
                                <span className="text-text-muted mb-4 text-[14px]">Check {email} to verify your account and get started.</span>
                                <div className="flex justify-center">
                                    <button className="min-w-8 bg-surface-panel flex h-11 justify-center rounded-md border px-4 pt-3 text-[14px] text-text-strong shadow-sm active:ring-2 active:ring-offset-2">
                                        Resend verification email
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <span className="flex text-text-muted mb-4 text-[14px] mt-6">Invalid user id. Please try and signup again.</span>
                        )}
                        {serverErrorMessage && <p className="mt-6 place-self-center text-sm text-status-danger-text">{serverErrorMessage}</p>}
                    </div>
                </div>
            </DefaultLayout>
        </>
    );
}
