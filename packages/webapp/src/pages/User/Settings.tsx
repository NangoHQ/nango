import { Helmet } from 'react-helmet';

import { FieldLabel, Input } from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { EditableInput } from '@/components/patterns/EditableInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useThemeStore } from '@/lib/theme';
import { useToast } from '../../hooks/useToast';
import { apiPatchUser, useUser } from '../../hooks/useUser';
import DashboardLayout from '../../layout/DashboardLayout';

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
            </div>
        </DashboardLayout>
    );
};
