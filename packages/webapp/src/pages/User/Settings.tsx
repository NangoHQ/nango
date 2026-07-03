import { Edit } from 'lucide-react';
import { useRef, useState } from 'react';
import { Helmet } from 'react-helmet';

import { Button, Field, FieldLabel, IconButton, InputGroup, InputGroupAddon, InputGroupInput } from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useThemeStore } from '@/lib/theme';
import { useToast } from '../../hooks/useToast';
import { apiPatchUser, useUser } from '../../hooks/useUser';
import DashboardLayout from '../../layout/DashboardLayout';

import type { Theme } from '@/lib/theme';

export const UserSettings: React.FC = () => {
    const { toast } = useToast();

    const { user, loading, error, mutate } = useUser();
    const theme = useThemeStore((s) => s.theme);
    const setTheme = useThemeStore((s) => s.setTheme);
    const ref = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(() => user?.name || '');
    const [edit, setEdit] = useState(false);

    const onSave = async () => {
        const updated = await apiPatchUser({ name });

        if ('error' in updated.json) {
            toast({ title: updated.json.error.message || 'Failed to update, an error occurred', variant: 'error' });
        } else {
            toast({ title: 'You have successfully updated your profile', variant: 'success' });
            setEdit(false);
            void mutate();
        }
    };

    if (loading) {
        return (
            <DashboardLayout fullWidth title="Profile settings" className="flex flex-col gap-8">
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
        <DashboardLayout fullWidth title="Profile settings" className="flex flex-col gap-8">
            <Helmet>
                <title>Profile Settings - Nango</title>
            </Helmet>
            <div className="flex flex-col gap-5">
                <Field>
                    <FieldLabel htmlFor="display-name">Display Name</FieldLabel>
                    <InputGroup>
                        <InputGroupInput id="display-name" ref={ref} value={name} onChange={(e) => setName(e.target.value)} disabled={!edit} />
                        <InputGroupAddon align="inline-end">
                            {!edit && (
                                <IconButton
                                    variant={'ghost'}
                                    size={'2xs'}
                                    label="Edit"
                                    onClick={() => {
                                        setEdit(true);
                                        setTimeout(() => {
                                            ref.current?.focus();
                                        }, 100);
                                    }}
                                >
                                    <Edit />
                                </IconButton>
                            )}
                        </InputGroupAddon>
                    </InputGroup>
                </Field>
                {edit && (
                    <div className="flex justify-end gap-2 items-center">
                        <Button
                            variant={'outline'}
                            onClick={() => {
                                setName(user.name);
                                setEdit(false);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button onClick={onSave}>Save</Button>
                    </div>
                )}
            </div>
            <Field>
                <FieldLabel>Email</FieldLabel>
                <p className="text-text-strong text-sm">{user.email}</p>
            </Field>
            <Field>
                <FieldLabel htmlFor="appearance">Appearance</FieldLabel>
                <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                    <SelectTrigger id="appearance" className="w-48">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="system">System</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                    </SelectContent>
                </Select>
            </Field>
        </DashboardLayout>
    );
};
