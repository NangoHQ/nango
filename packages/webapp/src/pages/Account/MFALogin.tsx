import { CircleX } from 'lucide-react';
import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';

import { Button, InputGroup, InputGroupInput } from '@nangohq/design-system';

import { Alert, AlertDescription } from '@/components/ui/Alert';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/InputOTP';
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

    const verifyCode = async (value: string) => {
        setErrorMessage('');
        try {
            const result = await verify(useRecoveryCode ? { type: 'recoveryCode', recoveryCode: value } : { type: 'code', code: value });
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

    const hasValidCode = useRecoveryCode ? code.length > 0 : /^\d{6}$/.test(code);

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
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void verifyCode(code);
                }}
                className="flex flex-col gap-5 w-full"
            >
                {useRecoveryCode ? (
                    <InputGroup>
                        <InputGroupInput
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                            placeholder="Recovery code"
                            aria-label="Recovery code"
                            autoComplete="one-time-code"
                            inputMode="text"
                            disabled={isPending}
                        />
                    </InputGroup>
                ) : (
                    <div className="flex justify-center">
                        <InputOTP
                            maxLength={6}
                            value={code}
                            onChange={setCode}
                            onComplete={(value: string) => void verifyCode(value)}
                            disabled={isPending}
                            aria-label="Authenticator code"
                            autoFocus
                        >
                            <InputOTPGroup>
                                {[0, 1, 2, 3, 4, 5].map((i) => (
                                    <InputOTPSlot key={i} index={i} />
                                ))}
                            </InputOTPGroup>
                        </InputOTP>
                    </div>
                )}
                <Button type="submit" size="lg" loading={isPending} disabled={!hasValidCode}>
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
