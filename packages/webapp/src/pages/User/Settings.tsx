import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';

import { Button, FieldLabel, Input } from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { EditableInput } from '@/components/patterns/EditableInput';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/InputOTP';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useThemeStore } from '@/lib/theme';
import { useMFA } from '../../hooks/useMFA';
import { useToast } from '../../hooks/useToast';
import { apiPatchUser, useUser } from '../../hooks/useUser';
import DashboardLayout from '../../layout/DashboardLayout';
import { APIError } from '../../utils/api';
import { getMFAErrorMessage } from './mfaErrors';

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

const MFASettings: React.FC = () => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { enabled, loading, error, disable } = useMFA();
    const [disableOpen, setDisableOpen] = useState(false);
    const [code, setCode] = useState('');
    const hasValidCode = /^\d{6}$/.test(code);

    const closeDisable = () => {
        setDisableOpen(false);
        setCode('');
    };

    if (error instanceof APIError && typeof error.json === 'object' && error.json !== null && 'error' in error.json) {
        const apiError = (error.json as { error: { code?: unknown } }).error;
        if (apiError.code === 'feature_disabled') {
            return null;
        }
    }

    const confirmDisable = async () => {
        try {
            await disable.mutateAsync({ code });
            toast({ title: 'Two-factor authentication is disabled', variant: 'success' });
            closeDisable();
        } catch (err) {
            setCode('');
            toast({ title: getMFAErrorMessage(err), variant: 'error' });
        }
    };

    return (
        <>
            <div className="col-span-2 mt-2 border-t border-border-muted pt-8" />
            <div className="col-span-2 grid grid-cols-[237px_1fr] items-center gap-x-6">
                <FieldLabel>Two-factor authentication</FieldLabel>
                <div className="flex flex-col items-start gap-3">
                    {loading ? (
                        <Skeleton className="h-8 w-40" />
                    ) : error ? (
                        <p className="text-text-danger text-ds-sm">Unable to load two-factor authentication settings.</p>
                    ) : enabled ? (
                        <Button variant="danger" onClick={() => setDisableOpen(true)}>
                            Disable 2FA
                        </Button>
                    ) : (
                        <Button onClick={() => navigate('/user-settings/enable-2fa')}>Enable 2FA</Button>
                    )}
                </div>
            </div>

            <Dialog open={disableOpen} onOpenChange={(open) => !open && closeDisable()}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Disable two-factor authentication</DialogTitle>
                        <DialogDescription>Enter the 6-digit code from your authenticator app to disable multi-factor auth</DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col items-center gap-3 py-2">
                        <span className="text-body-small-medium text-text-strong">Enter your verification code:</span>
                        <InputOTP maxLength={6} value={code} onChange={setCode} onComplete={() => void confirmDisable()} autoFocus>
                            <InputOTPGroup>
                                {[0, 1, 2, 3, 4, 5].map((i) => (
                                    <InputOTPSlot key={i} index={i} />
                                ))}
                            </InputOTPGroup>
                        </InputOTP>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeDisable}>
                            Cancel
                        </Button>
                        <Button variant="danger" onClick={() => void confirmDisable()} loading={disable.isPending} disabled={!hasValidCode}>
                            Disable 2FA
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
