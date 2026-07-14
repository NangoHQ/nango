import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { Helmet } from 'react-helmet';

import { Button, FieldLabel, Input } from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { EditableInput } from '@/components/patterns/EditableInput';
import { CopyButton } from '@/components/ui/CopyButton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useThemeStore } from '@/lib/theme';
import { useMFA } from '../../hooks/useMFA';
import { useToast } from '../../hooks/useToast';
import { apiPatchUser, useUser } from '../../hooks/useUser';
import DashboardLayout from '../../layout/DashboardLayout';
import { APIError } from '../../utils/api';

import type { Theme } from '@/lib/theme';

// Mirrors the backend constraint (PATCH /api/v1/user: z.string().min(3).max(255)).
const validateDisplayName = (value: string): string | null => {
    if (value.trim().length === 0) {
        return 'Display name is required';
    }
    if (value.length < 3) {
        return 'Display name must be at least 3 characters';
    }
    if (value.length > 255) {
        return 'Display name must be 255 characters or fewer';
    }
    return null;
};

export const UserSettings: React.FC = () => {
    const { toast } = useToast();

    const { user, loading, error, mutate } = useUser();
    const theme = useThemeStore((s) => s.theme);
    const setTheme = useThemeStore((s) => s.setTheme);

    const onSaveDisplayName = async (name: string) => {
        const updated = await apiPatchUser({ name });

        if ('error' in updated.json) {
            toast({ title: updated.json.error.message || 'Failed to update, an error occurred', variant: 'error' });
            // Re-throw so EditableInput keeps the editor open on failure.
            throw new Error('Failed to update profile');
        }

        toast({ title: 'You have successfully updated your profile', variant: 'success' });
        void mutate();
    };

    if (loading) {
        return (
            <DashboardLayout fullWidth title="Profile settings">
                <Helmet>
                    <title>Profile Settings - Nango</title>
                </Helmet>
                <div className="flex flex-col gap-4">
                    <Skeleton className="w-[250px]" />
                    <Skeleton className="w-[250px]" />
                </div>
            </DashboardLayout>
        );
    }

    if (error) {
        return <CriticalErrorAlert message="Failed to load profile settings" />;
    }

    if (!user) {
        return null;
    }

    return (
        <DashboardLayout fullWidth title="Profile settings">
            <Helmet>
                <title>Profile Settings - Nango</title>
            </Helmet>
            <div className="grid max-w-[700px] grid-cols-[237px_1fr] items-center gap-x-6 gap-y-8">
                <FieldLabel htmlFor="display-name">Display name</FieldLabel>
                <EditableInput id="display-name" initialValue={user.name} onSave={onSaveDisplayName} validate={validateDisplayName} />

                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" value={user.email} disabled readOnly />

                <FieldLabel htmlFor="appearance">Appearance</FieldLabel>
                <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                    <SelectTrigger id="appearance" className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="system">System</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                    </SelectContent>
                </Select>

                <MFASettings />
            </div>
        </DashboardLayout>
    );
};

type MFAAction = 'disable' | 'regenerate' | null;

function getMFAErrorMessage(error: unknown): string {
    if (error instanceof APIError) {
        const json: unknown = error.json;
        if (typeof json === 'object' && json !== null && 'error' in json) {
            const apiError = (json as { error: unknown }).error;
            if (typeof apiError === 'object' && apiError !== null && 'message' in apiError) {
                const message = (apiError as { message: unknown }).message;
                if (typeof message === 'string') {
                    return message;
                }
            }
        }
    }
    return 'Something went wrong. Please try again.';
}

const MFASettings: React.FC = () => {
    const { toast } = useToast();
    const { enabled, loading, error, enroll, activate, regenerateRecoveryCodes, disable } = useMFA();
    const [enrollmentUri, setEnrollmentUri] = useState<string | null>(null);
    const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
    const [code, setCode] = useState('');
    const [action, setAction] = useState<MFAAction>(null);

    if (error instanceof APIError && typeof error.json === 'object' && error.json !== null && 'error' in error.json) {
        const apiError = (error.json as { error: { code?: unknown } }).error;
        if (apiError.code === 'feature_disabled') {
            return null;
        }
    }

    const startEnrollment = async () => {
        try {
            const result = await enroll.mutateAsync();
            setCode('');
            setEnrollmentUri(result.data.otpauthUri);
        } catch (err) {
            toast({ title: getMFAErrorMessage(err), variant: 'error' });
        }
    };

    const activateEnrollment = async () => {
        try {
            const result = await activate.mutateAsync({ code });
            setEnrollmentUri(null);
            setCode('');
            setRecoveryCodes(result.data.recoveryCodes);
            toast({ title: 'Multi-factor authentication is enabled', variant: 'success' });
        } catch (err) {
            toast({ title: getMFAErrorMessage(err), variant: 'error' });
        }
    };

    const confirmAction = async () => {
        try {
            if (action === 'regenerate') {
                const result = await regenerateRecoveryCodes.mutateAsync({ code });
                setRecoveryCodes(result.data.recoveryCodes);
                toast({ title: 'New recovery codes generated', variant: 'success' });
            } else if (action === 'disable') {
                await disable.mutateAsync({ code });
                toast({ title: 'Multi-factor authentication is disabled', variant: 'success' });
            }
            setAction(null);
            setCode('');
        } catch (err) {
            toast({ title: getMFAErrorMessage(err), variant: 'error' });
        }
    };

    const actionTitle = action === 'disable' ? 'Disable multi-factor authentication' : 'Generate new recovery codes';
    const actionDescription =
        action === 'disable'
            ? 'Enter a code from your authenticator app to disable multi-factor authentication.'
            : 'Enter a code from your authenticator app to replace your existing recovery codes.';

    return (
        <>
            <div className="col-span-2 mt-2 border-t border-border-muted pt-8" />
            <div className="col-span-2 grid grid-cols-[237px_1fr] items-center gap-x-6">
                <FieldLabel>Multi-factor authentication</FieldLabel>
                <div className="flex flex-col items-start gap-3">
                    {loading ? (
                        <Skeleton className="h-8 w-40" />
                    ) : error ? (
                        <p className="text-text-danger text-ds-sm">Unable to load multi-factor authentication settings.</p>
                    ) : enabled ? (
                        <>
                            <p className="text-text-secondary text-ds-sm">Authenticator app protection is enabled.</p>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="outline" onClick={() => setAction('regenerate')}>
                                    Generate recovery codes
                                </Button>
                                <Button variant="danger" onClick={() => setAction('disable')}>
                                    Disable MFA
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-text-secondary text-ds-sm">Use an authenticator app to add an extra layer of protection to your account.</p>
                            <Button onClick={() => void startEnrollment()} loading={enroll.isPending}>
                                Enable MFA
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <Dialog open={enrollmentUri !== null} onOpenChange={(open) => !open && setEnrollmentUri(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Set up your authenticator app</DialogTitle>
                        <DialogDescription>Scan this QR code, then enter the six-digit code from your authenticator app.</DialogDescription>
                    </DialogHeader>
                    {enrollmentUri && (
                        <div className="flex flex-col items-center gap-4">
                            <div className="rounded-ds-sm border border-border-default bg-white p-4">
                                <QRCodeSVG value={enrollmentUri} size={180} bgColor="#ffffff" fgColor="#000000" />
                            </div>
                            <div className="flex items-center gap-1 text-text-secondary text-ds-xs">
                                <span>Cannot scan the code?</span>
                                <CopyButton text={enrollmentUri} />
                            </div>
                        </div>
                    )}
                    <label className="flex flex-col gap-2 text-text-default text-ds-sm">
                        Verification code
                        <Input
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            placeholder="123456"
                        />
                    </label>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEnrollmentUri(null)}>
                            Cancel
                        </Button>
                        <Button onClick={() => void activateEnrollment()} loading={activate.isPending} disabled={code.length !== 6}>
                            Confirm and continue
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={action !== null} onOpenChange={(open) => !open && setAction(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{actionTitle}</DialogTitle>
                        <DialogDescription>{actionDescription}</DialogDescription>
                    </DialogHeader>
                    <label className="flex flex-col gap-2 text-text-default text-ds-sm">
                        Verification code
                        <Input
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            placeholder="123456"
                        />
                    </label>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAction(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant={action === 'disable' ? 'danger' : 'primary'}
                            onClick={() => void confirmAction()}
                            loading={disable.isPending || regenerateRecoveryCodes.isPending}
                            disabled={code.length !== 6}
                        >
                            {action === 'disable' ? 'Disable MFA' : 'Generate codes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={recoveryCodes !== null} onOpenChange={() => undefined}>
                <DialogContent
                    showCloseButton={false}
                    onEscapeKeyDown={(event) => event.preventDefault()}
                    onPointerDownOutside={(event) => event.preventDefault()}
                >
                    <DialogHeader>
                        <DialogTitle>Save your recovery codes</DialogTitle>
                        <DialogDescription>Keep these codes somewhere safe. Each code can only be used once and will not be shown again.</DialogDescription>
                    </DialogHeader>
                    {recoveryCodes && (
                        <div className="flex flex-col gap-3">
                            <div className="grid grid-cols-2 gap-2 rounded-ds-sm border border-border-default bg-surface-canvas p-4 font-mono text-ds-sm text-text-default">
                                {recoveryCodes.map((recoveryCode) => (
                                    <code key={recoveryCode}>{recoveryCode}</code>
                                ))}
                            </div>
                            <div className="flex justify-end">
                                <CopyButton text={recoveryCodes.join('\n')} />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button onClick={() => setRecoveryCodes(null)}>I saved my codes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
