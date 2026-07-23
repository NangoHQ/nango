import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';

import { Button } from '@nangohq/design-system';

import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components-v2/ui/InputOTP';
import { Checkbox } from '@/components/ui/Checkbox';
import { CopyButton } from '@/components/ui/CopyButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMFA } from '@/hooks/useMFA';
import { useToast } from '@/hooks/useToast';
import DashboardLayout from '@/layout/DashboardLayout';
import { track } from '@/utils/analytics';
import { MfaStepper } from './components/MfaStepper';
import { RecoveryCodes } from './components/RecoveryCodes';
import { getMFAErrorMessage } from './mfaErrors';

import type { MfaStep } from './components/MfaStepper';

function extractSecret(otpauthUri: string): string | null {
    const query = otpauthUri.split('?')[1];
    if (!query) {
        return null;
    }
    const secret = new URLSearchParams(query).get('secret');
    return secret ? secret.replace(/(.{4})/g, '$1 ').trim() : null;
}

export const Enable2FA: React.FC = () => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { enroll, activate } = useMFA();

    const [step, setStep] = useState<MfaStep>('scan');
    const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [savedConfirmed, setSavedConfirmed] = useState(false);

    const enrollmentStarted = useRef(false);

    const goToSettings = () => navigate('/user-settings');

    const cancel = (fromStep: 'scan' | 'save') => {
        track('web:2fa:enable_cancelled', { step: fromStep });
        goToSettings();
    };

    useEffect(() => {
        if (enrollmentStarted.current) {
            return;
        }
        enrollmentStarted.current = true;

        void (async () => {
            try {
                const result = await enroll.mutateAsync();
                setOtpauthUri(result.data.otpauthUri);
                track('web:2fa:enable_started', {});
            } catch (err) {
                toast({ title: getMFAErrorMessage(err), variant: 'error' });
                goToSettings();
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const verifyAndContinue = async () => {
        try {
            const result = await activate.mutateAsync({ code });
            track('web:2fa:enabled', {});
            setRecoveryCodes(result.data.recoveryCodes);
            setStep('save');
        } catch (err) {
            setCode('');
            toast({ title: getMFAErrorMessage(err), variant: 'error' });
        }
    };

    const secret = otpauthUri ? extractSecret(otpauthUri) : null;
    const hasValidCode = /^\d{6}$/.test(code);

    return (
        <DashboardLayout fullWidth>
            <Helmet>
                <title>Enable 2FA - Nango</title>
            </Helmet>
            <div className="mx-auto flex max-w-[640px] flex-col gap-8 py-4">
                <MfaStepper current={step} />

                <div className="rounded-ds-sm border-ds-hairline border-border-default bg-surface-panel">
                    {step === 'scan' && (
                        <>
                            <div className="flex flex-col items-center gap-6 px-8 py-8">
                                <div className="flex flex-col items-center gap-1 text-center">
                                    <h2 className="text-heading-sm text-text-strong">Set up authenticator app</h2>
                                    <p className="text-body-small-regular text-text-secondary">
                                        Scan this with Google Authenticator, 1Password, or any TOTP app.
                                    </p>
                                </div>

                                {otpauthUri ? (
                                    <>
                                        <div className="rounded-ds-xs border-ds-hairline border-border-default bg-white p-3">
                                            <QRCodeSVG value={otpauthUri} size={160} bgColor="#ffffff" fgColor="#000000" />
                                        </div>
                                        <div className="flex flex-col items-center gap-2">
                                            <span className="text-body-small-regular text-text-secondary">Can&apos;t scan? Enter this key manually:</span>
                                            {secret && (
                                                <div className="flex items-center gap-1 rounded-ds-xs bg-surface-input px-2 py-1 font-mono text-ds-sm text-text-default">
                                                    <span>{secret}</span>
                                                    <CopyButton text={secret.replace(/\s/g, '')} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-center gap-3">
                                            <span className="text-body-small-medium text-text-strong">Enter the 6-digit code from your app:</span>
                                            <InputOTP maxLength={6} value={code} onChange={setCode} onComplete={() => void verifyAndContinue()} autoFocus>
                                                <InputOTPGroup>
                                                    {[0, 1, 2, 3, 4, 5].map((i) => (
                                                        <InputOTPSlot key={i} index={i} />
                                                    ))}
                                                </InputOTPGroup>
                                            </InputOTP>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center gap-4">
                                        <Skeleton className="size-[160px]" />
                                        <Skeleton className="h-6 w-40" />
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end gap-2 border-t border-border-muted px-6 py-4">
                                <Button variant="outline" onClick={() => cancel('scan')}>
                                    Cancel
                                </Button>
                                <Button onClick={() => void verifyAndContinue()} loading={activate.isPending} disabled={!hasValidCode}>
                                    Continue
                                </Button>
                            </div>
                        </>
                    )}

                    {step === 'save' && (
                        <>
                            <div className="flex flex-col items-center gap-6 px-8 py-8">
                                <div className="flex flex-col items-center gap-1 text-center">
                                    <h2 className="text-heading-sm text-text-strong">Save your recovery codes</h2>
                                    <p className="text-body-small-regular text-text-secondary">
                                        Use one of these if you lose access to your authenticator app. Each code works once.
                                    </p>
                                </div>

                                <RecoveryCodes codes={recoveryCodes} context="enroll" />

                                <label className="flex items-center gap-2 text-body-small-regular text-text-default">
                                    <Checkbox checked={savedConfirmed} onCheckedChange={(value) => setSavedConfirmed(value === true)} />
                                    I&apos;ve saved these codes somewhere safe
                                </label>
                            </div>
                            <div className="flex justify-end gap-2 border-t border-border-muted px-6 py-4">
                                <Button variant="outline" onClick={() => cancel('save')}>
                                    Cancel
                                </Button>
                                <Button onClick={() => setStep('done')} disabled={!savedConfirmed}>
                                    Continue
                                </Button>
                            </div>
                        </>
                    )}

                    {step === 'done' && (
                        <div className="flex flex-col items-center gap-4 px-8 py-10 text-center">
                            <div className="flex flex-col items-center gap-2">
                                <h2 className="text-heading-sm text-text-strong">Two-factor authentication is enabled</h2>
                                <p className="text-body-small-regular text-text-secondary">You&apos;ll be asked for a code at every sign-in.</p>
                                <p className="text-body-small-regular text-text-secondary">
                                    {recoveryCodes.length} of {recoveryCodes.length} recovery codes remaining
                                </p>
                            </div>
                            <Button variant="outline" onClick={goToSettings}>
                                Close
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
};
