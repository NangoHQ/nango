import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
    Button,
    Dialog,
    DialogBody,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    InputGroup,
    InputGroupInput
} from '@nangohq/design-system';

import { MfaChallengeDialog } from '@/components/patterns/MfaChallengeDialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { useToast } from '@/hooks/useToast';
import { usePutUserPassword } from '@/hooks/useUser';
import { track } from '@/utils/analytics';
import { APIError } from '@/utils/api';
import { getMFAErrorMessage } from '@/utils/mfaErrors';
import { Password, passwordSchema } from '../Account/components/Password';

import type { MFACredential } from '@nangohq/types';

const changePasswordSchema = z
    .object({
        oldPassword: z.string().min(1, 'Current password is required').max(64, 'Password must be 64 characters or fewer'),
        newPassword: passwordSchema,
        confirmPassword: z.string().min(1, 'Please confirm your new password')
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword']
    });

type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

export const ChangePasswordDialog: React.FC = () => {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [challengeOpen, setChallengeOpen] = useState(false);
    const [challengeError, setChallengeError] = useState<string | null>(null);
    const { mutateAsync: changePassword, isPending } = usePutUserPassword();

    const form = useForm<ChangePasswordFormData>({
        resolver: zodResolver(changePasswordSchema),
        defaultValues: {
            oldPassword: '',
            newPassword: '',
            confirmPassword: ''
        },
        mode: 'onTouched'
    });

    const closeChallenge = () => {
        setChallengeOpen(false);
        setChallengeError(null);
    };

    const attempt = async (mfa?: MFACredential) => {
        const { oldPassword, newPassword } = form.getValues();

        try {
            await changePassword({ oldPassword, newPassword, mfa });
            track('web:password:changed', {});
            toast({ title: 'Password updated', variant: 'success' });
            closeChallenge();
            setIsOpen(false);
            form.reset();
        } catch (err) {
            const apiErr = err instanceof APIError && err.json && typeof err.json === 'object' && 'error' in err.json ? err.json.error : null;

            if (apiErr?.code === 'mfa_code_required') {
                setChallengeError(null);
                setChallengeOpen(true);
                return;
            }

            if (apiErr?.code === 'invalid_mfa_code') {
                setChallengeError(getMFAErrorMessage(err));
                return;
            }

            closeChallenge();

            if (apiErr?.code === 'incorrect_password') {
                form.setError('oldPassword', { message: 'Incorrect current password' });
                return;
            }

            toast({ title: (typeof apiErr?.message === 'string' && apiErr.message) || 'Failed to change password', variant: 'error' });
        }
    };

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                setIsOpen(open);
                if (!open) {
                    closeChallenge();
                    form.reset();
                }
            }}
        >
            <DialogTrigger asChild>
                <Button variant="outline">Change password</Button>
            </DialogTrigger>
            <DialogContent>
                <Form {...form}>
                    <form id="change-password-form" onSubmit={form.handleSubmit(() => attempt())} className="flex flex-col">
                        <DialogHeader>
                            <DialogTitle>Change password</DialogTitle>
                            <DialogDescription>Enter your current password and choose a new one.</DialogDescription>
                        </DialogHeader>
                        <DialogBody>
                            <div className="flex flex-col gap-4">
                                <FormField
                                    control={form.control}
                                    name="oldPassword"
                                    render={({ field, fieldState }) => (
                                        <FormItem>
                                            <FormLabel>Current password</FormLabel>
                                            <InputGroup>
                                                <FormControl>
                                                    <InputGroupInput
                                                        type="password"
                                                        autoComplete="current-password"
                                                        autoFocus
                                                        {...field}
                                                        aria-invalid={!!fieldState.error}
                                                    />
                                                </FormControl>
                                            </InputGroup>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="newPassword"
                                    render={() => <Password label="New password" placeholder="" autoComplete="new-password" />}
                                />
                                <FormField
                                    control={form.control}
                                    name="confirmPassword"
                                    render={({ field, fieldState }) => (
                                        <FormItem>
                                            <FormLabel>Confirm new password</FormLabel>
                                            <InputGroup>
                                                <FormControl>
                                                    <InputGroupInput type="password" autoComplete="new-password" {...field} aria-invalid={!!fieldState.error} />
                                                </FormControl>
                                            </InputGroup>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </DialogBody>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button variant="outline" size="sm">
                                    Cancel
                                </Button>
                            </DialogClose>
                            <Button type="submit" form="change-password-form" size="sm" loading={isPending}>
                                Update password
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>

            <MfaChallengeDialog
                open={challengeOpen}
                purpose="change your password"
                confirmText="Update password"
                error={challengeError}
                verifying={isPending}
                onCancel={closeChallenge}
                onConfirm={(mfa) => void attempt(mfa)}
            />
        </Dialog>
    );
};
