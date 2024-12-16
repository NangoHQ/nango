import { useRef, useState } from 'react';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import { Skeleton } from '../../components/ui/Skeleton';
import { Input } from '../../components/ui/input/Input';
import { apiPatchUser, useUser } from '../../hooks/useUser';
import DashboardLayout from '../../layout/DashboardLayout';
import { Pencil1Icon } from '@radix-ui/react-icons';
import { useToast } from '../../hooks/useToast';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/Tooltip';
import { Button } from '../../components/ui/button/Button';
import { Helmet } from 'react-helmet';
import { ErrorPageComponent } from '../../components/ErrorComponent';

export const UserSettings: React.FC = () => {
    const { toast } = useToast();

    const { user, loading, error, mutate } = useUser();
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
            <DashboardLayout selectedItem={LeftNavBarItems.UserSettings}>
                <Helmet>
                    <title>Profile Settings - Nango</title>
                </Helmet>
                <h2 className="text-3xl font-semibold text-white mb-16">Profile Settings</h2>
                <div className="flex flex-col gap-4">
                    <Skeleton className="w-[250px]" />
                    <Skeleton className="w-[250px]" />
                </div>
            </DashboardLayout>
        );
    }

    if (error) {
        return <ErrorPageComponent title="Profile Settings" error={error} page={LeftNavBarItems.UserSettings} />;
    }

    if (!user) {
        return null;
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.UserSettings}>
            <Helmet>
                <title>Profile Settings - Nango</title>
            </Helmet>
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-semibold text-white">Profile Settings</h2>
            </div>
            <div className="flex flex-col gap-12 mt-16">
                <div className="flex flex-col gap-5">
                    <h3 className="font-semibold text-sm text-white">Display Name</h3>
                    <Input
                        ref={ref}
                        variant={edit ? 'border' : 'flat'}
                        inputSize={'lg'}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={!edit}
                        after={
                            <div className="flex gap-1 items-center">
                                {!edit && (
                                    <Tooltip delayDuration={0}>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant={'icon'}
                                                size={'sm'}
                                                onClick={() => {
                                                    setEdit(true);
                                                    setTimeout(() => {
                                                        ref.current?.focus();
                                                    }, 100);
                                                }}
                                            >
                                                <Pencil1Icon />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent sideOffset={10}>Edit</TooltipContent>
                                    </Tooltip>
                                )}
                            </div>
                        }
                    />
                    {edit && (
                        <div className="flex justify-end gap-2 items-center">
                            <Button
                                size={'md'}
                                variant={'emptyFaded'}
                                onClick={() => {
                                    setName(user.name);
                                    setEdit(false);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button size={'md'} onClick={onSave}>
                                Save
                            </Button>
                        </div>
                    )}
                </div>
                <div className="flex flex-col gap-5">
                    <h3 className="font-semibold text-sm text-white">Email</h3>
                    <p className="text-white text-sm">{user.email}</p>
                </div>
            </div>
        </DashboardLayout>
    );
};
