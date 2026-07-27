import { CircleX } from 'lucide-react';
import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';

import { Button, InputGroup, InputGroupInput } from '@nangohq/design-system';

import { Alert, AlertDescription } from '@/components/ui/Alert';
import { StyledLink } from '@/components/ui/StyledLink';
import { useMFALoginVerification } from '@/hooks/useAuth';
import DefaultLayout from '@/layout/DefaultLayout';
import { APIError } from '@/utils/api';
import { useSignin } from '@/utils/user';

export const MFALogin: React.FC = () => {
    const navigate = useNavigate();
    const signin = useSignin();
    const { mutateAsync: verify, isPending } = useMFALoginVerification();
    const [code, setCode] = useState('');
    const [useRecoveryCode, setUseRecoveryCode] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setErrorMessage('');
        try {
            const result = await verify(useRecoveryCode ? { type: 'recoveryCode', recoveryCode: code } : { type: 'code', code });
            signin(result.data.user);
            navigate(result.data.url, { replace: true });
        } catch (err) {
            if (err instanceof APIError && err.res.status === 400) {
                setErrorMessage('The code is invalid or has expired. Please try again.');
            } else {
                setErrorMessage('Something went wrong. Please try again later.');
            }
        }
    };

    return (
        <DefaultLayout className="gap-10">
            <Helmet>
                <title>Verify your sign-in - Nango</title>
            </Helmet>
            <div className="flex flex-col items-center gap-3">
                <h2 className="text-title-group text-text-strong">Verify your sign-in</h2>
                <span className="text-body-medium-regular text-text-secondary text-center">
                    {useRecoveryCode ? 'Enter one of your recovery codes to continue.' : 'Enter the code from your authenticator app to continue.'}
                </span>
                {errorMessage && (
                    <Alert variant="error">
                        <CircleX />
                        <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                )}
            </div>
            <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-5 w-full">
                <InputGroup>
                    <InputGroupInput
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        placeholder={useRecoveryCode ? 'Recovery code' : '123456'}
                        aria-label={useRecoveryCode ? 'Recovery code' : 'Authenticator code'}
                        autoComplete="one-time-code"
                        inputMode={useRecoveryCode ? 'text' : 'numeric'}
                        disabled={isPending}
                    />
                </InputGroup>
                <Button type="submit" size="lg" loading={isPending} disabled={useRecoveryCode ? code.length === 0 : !/^\d{6}$/.test(code)}>
                    Verify and continue
                </Button>
            </form>
            <span className="text-body-medium-regular text-text-muted text-center">
                <button
                    type="button"
                    className="underline"
                    onClick={() => {
                        setUseRecoveryCode((value) => !value);
                        setCode('');
                    }}
                >
                    {useRecoveryCode ? 'Use an authenticator code' : 'Use a recovery code'}
                </button>
                {' or '}
                <StyledLink to="/signin">start over</StyledLink>.
            </span>
        </DefaultLayout>
    );
};
