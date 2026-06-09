import { Pencil } from 'lucide-react';
import { useRef, useState } from 'react';
import { Helmet } from 'react-helmet';

import { useToast } from '../../hooks/useToast';
import { apiPatchUser, useUser } from '../../hooks/useUser';
import DashboardLayout from '../../layout/DashboardLayout';
import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { Button } from '@/components/ui/Button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/InputGroup';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { type Theme, useThemeStore } from '@/lib/theme';
import { cn } from '@/utils/utils';

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
            <DashboardLayout>
                <Helmet>
                    <title>Profile Settings - Nango</title>
                </Helmet>
                <h2 className="text-3xl font-semibold text-text-strong mb-16">Profile Settings</h2>
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
        <DashboardLayout>
            <Helmet>
                <title>Profile Settings - Nango</title>
            </Helmet>
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-semibold text-text-strong">Profile Settings</h2>
            </div>
            <div className="flex flex-col gap-12 mt-16">
                <div className="flex flex-col gap-5">
                    <h3 className="font-semibold text-sm text-text-strong">Display Name</h3>
                    <InputGroup className={cn('h-[42px]', !edit && 'bg-surface-input border-dark-800')}>
                        <InputGroupInput ref={ref} value={name} onChange={(e) => setName(e.target.value)} disabled={!edit} />
                        <InputGroupAddon align="inline-end">
                            {!edit && (
                                <Tooltip delayDuration={0}>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant={'ghost'}
                                            size={'icon'}
                                            onClick={() => {
                                                setEdit(true);
                                                setTimeout(() => {
                                                    ref.current?.focus();
                                                }, 100);
                                            }}
                                        >
                                            <Pencil size={14} />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent sideOffset={10}>Edit</TooltipContent>
                                </Tooltip>
                            )}
                        </InputGroupAddon>
                    </InputGroup>
                    {edit && (
                        <div className="flex justify-end gap-2 items-center">
                            <Button
                                variant={'tertiary'}
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
                <div className="flex flex-col gap-5">
                    <h3 className="font-semibold text-sm text-text-strong">Email</h3>
                    <p className="text-text-strong text-sm">{user.email}</p>
                </div>
                <div className="flex flex-col gap-5">
                    <h3 className="font-semibold text-sm text-text-strong">Theme</h3>
                    <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                        <SelectTrigger className="w-48">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="system">System</SelectItem>
                            <SelectItem value="light">Light</SelectItem>
                            <SelectItem value="dark">Dark</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </DashboardLayout>
    );
};
