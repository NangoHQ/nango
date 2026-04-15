import { CircleX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';

import { StyledLink } from '@/components-v2/StyledLink';
import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { Button } from '@/components-v2/ui/button';
import { InputGroup, InputGroupInput } from '@/components-v2/ui/input-group';
import { useManagedEmailVerification, useManagedEmailVerificationAPI } from '@/hooks/useAuth';
import DefaultLayout from '@/layout/DefaultLayout';
import { APIError } from '@/utils/api';

export const ManagedEmailVerification: React.FC = () => {
    const navigate = useNavigate();
    const [code, setCode] = useState('');
    const [serverErrorMessage, setServerErrorMessage] = useState('');

    const { data, error, isLoading } = useManagedEmailVerification();
    const { mutateAsync: verifyEmailCode, isPending } = useManagedEmailVerificationAPI();

    useEffect(() => {
        if (!error) {
            return;
        }

        if (error instanceof APIError && error.res.status === 404) {
            navigate('/signin', { replace: true });
            return;
        }

        setServerErrorMessage('Issue loading the WorkOS verification flow. Please try signing in again.');
    }, [error, navigate]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setServerErrorMessage('');

        try {
            const res = await verifyEmailCode({ code });
            if (res.status === 200) {
                window.location.href = res.json.data.url;
                return;
            }

            if (res.status === 404) {
                navigate('/signin', { replace: true });
                return;
            }

            setServerErrorMessage(res.json.error.message || 'Issue verifying your email. Please try signing in again.');
        } catch {
            setServerErrorMessage('Issue verifying your email. Please try signing in again.');
        }
    };

    return (
        <DefaultLayout className="gap-10">
            <Helmet>
                <title>Verify your email - Nango</title>
            </Helmet>

            <div className="flex flex-col items-center gap-3">
                <h2 className="text-title-group text-text-primary">Verify your email</h2>

                {serverErrorMessage && (
                    <Alert variant="error">
                        <CircleX />
                        <AlertDescription>{serverErrorMessage}</AlertDescription>
                    </Alert>
                )}

                <span className="text-body-medium-regular text-text-secondary text-center">
                    Enter the verification code WorkOS sent to {data?.data.email || 'your email'} to finish signing in with Google.
                </span>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5 w-full">
                <InputGroup className="h-11">
                    <InputGroupInput
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        placeholder="Verification code"
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        disabled={isLoading || isPending}
                    />
                </InputGroup>

                <Button type="submit" size="lg" className="w-full" loading={isPending} disabled={code.trim().length < 6}>
                    Verify and continue
                </Button>
            </form>

            <span className="text-body-medium-regular text-text-tertiary text-center">
                Didn&apos;t get the code? <StyledLink to="/signin">Start the Google sign-in flow again.</StyledLink>
            </span>
        </DefaultLayout>
    );
};
