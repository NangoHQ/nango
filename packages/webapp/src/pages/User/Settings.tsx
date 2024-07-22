import { useRef, useState } from 'react';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import Info from '../../components/ui/Info';
import { Skeleton } from '../../components/ui/Skeleton';
import { Input } from '../../components/ui/input/Input';
import { apiPatchUser, useUser } from '../../hooks/useUser';
import DashboardLayout from '../../layout/DashboardLayout';
import { Pencil1Icon } from '@radix-ui/react-icons';
import { useToast } from '../../hooks/useToast';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/Tooltip';
import Button from '../../components/ui/button/Button';

export const UserSettings: React.FC = () => {
    const { toast } = useToast();

    const { user, loading, error, mutate } = useUser();
    const ref = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(() => user?.name || '');
    const [edit, setEdit] = useState(false);

    const onSave = async () => {
        const update = await apiPatchUser({ name });

        if (!update || update.res.status === 200) {
            toast({ title: 'Profile updated successfully', variant: 'success' });
            setEdit(false);
            void mutate();
        }
    };

    if (loading) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.UserSettings}>
                <h2 className="text-3xl font-semibold text-white mb-16">Profile Settings</h2>
                <div className="flex flex-col gap-4">
                    <Skeleton className="w-[250px]" />
                    <Skeleton className="w-[250px]" />
                </div>
            </DashboardLayout>
        );
    }

    if (error) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.UserSettings}>
                <h2 className="text-3xl font-semibold text-white mb-16">Profile Settings</h2>
                <Info color={'red'} classNames="text-xs" size={20}>
                    An error occurred, refresh your page or reach out to the support.{' '}
                    {error.error.code === 'generic_error_support' && (
                        <>
                            (id: <span className="select-all">{error.error.payload}</span>)
                        </>
                    )}
                </Info>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.UserSettings}>
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-semibold text-white">Profile Settings</h2>
            </div>
            <div className="flex flex-col gap-12 mt-16">
                <div className="flex flex-col gap-5">
                    <h3 className="font-semibold text-sm text-white">Display Name</h3>
                    <Input
                        ref={ref}
                        variant={'flat'}
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
                        <div className="flex justify-end gap-1 items-center">
                            <Button
                                size={'sm'}
                                variant={'zinc'}
                                onClick={() => {
                                    setName(user!.name);
                                    setEdit(false);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button size={'sm'} onClick={onSave}>
                                Save
                            </Button>
                        </div>
                    )}
                </div>
                <div className="flex flex-col gap-5">
                    <h3 className="font-semibold text-sm text-white">Email</h3>
                    <p className="text-white text-sm">{user!.email}</p>
                </div>
            </div>
        </DashboardLayout>
    );
};
