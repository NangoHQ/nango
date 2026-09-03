import { permissions } from '@nangohq/authz';
import { FieldLabel } from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { EditableInput } from '@/components/patterns/EditableInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { usePutTeam, useTeam } from '../../../hooks/useTeam';
import { useStore } from '../../../store';

export const TeamSettings: React.FC = () => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();

    const { data, isLoading, error } = useTeam(env);
    const team = data?.data.account;
    const { mutateAsync: putTeamAsync } = usePutTeam(env);

    const { can } = usePermissions();
    const canManageTeam = can(permissions.canManageTeam);

    const onSaveTeamName = async (name: string) => {
        try {
            await putTeamAsync({ name });
            toast({ title: 'Team name has been updated', variant: 'success' });
        } catch (err) {
            toast({ title: 'Failed to update team name', variant: 'error' });
            // Throw for EditableInput
            throw err;
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col gap-3">
                <Skeleton className="w-[250px]" />
                <Skeleton className="w-full" />
            </div>
        );
    }

    if (!team || error) {
        return <CriticalErrorAlert message="Failed to load team settings" />;
    }

    return (
        <div className="grid max-w-[700px] grid-cols-[237px_1fr] items-center gap-x-6">
            <FieldLabel htmlFor="team-name">Team name</FieldLabel>
            <EditableInput id="team-name" initialValue={team?.name} canEdit={canManageTeam} onSave={onSaveTeamName} />
        </div>
    );
};
