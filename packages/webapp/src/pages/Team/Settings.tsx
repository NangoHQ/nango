import { Helmet } from 'react-helmet';

import { AddTeamMemberButton } from './components/AddTeamMemberButton';
import { TeamMembers } from './components/TeamMembers';
import { TeamSettings } from './components/TeamSettings';
import { ErrorPageComponent } from '../../components/ErrorComponent';
import { Skeleton } from '../../components/ui/Skeleton';
import { useTeam } from '../../hooks/useTeam';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { ImpersonateForm } from './components/ImpersonateForm';

import type { ApiError } from '@nangohq/types';

export const TeamSettingsPage: React.FC = () => {
    const env = useStore((state) => state.env);

    const { data, error, isLoading } = useTeam(env);

    if (isLoading) {
        return (
            <DashboardLayout>
                <Helmet>
                    <title>Team Settings - Nango</title>
                </Helmet>
                <div className="flex items-center justify-between">
                    <h2 className="text-heading-large text-text-primary">Team settings</h2>
                </div>
                <div className="flex flex-col gap-4">
                    <Skeleton className="w-[250px]" />
                    <Skeleton className="w-[250px]" />
                </div>
            </DashboardLayout>
        );
    }

    if (error) {
        return <ErrorPageComponent title="Team Settings" error={error?.json as ApiError<string>} />;
    }

    const isNangoAdmin = data?.data.isAdminTeam;

    return (
        <DashboardLayout fullWidth className="flex flex-col gap-10">
            <Helmet>
                <title>Team Settings - Nango</title>
            </Helmet>
            <div className="flex items-center justify-between">
                <h2 className="text-heading-large text-text-primary">Team settings</h2>
                <AddTeamMemberButton />
            </div>

            <TeamSettings />
            <TeamMembers />
            {isNangoAdmin && <ImpersonateForm />}
        </DashboardLayout>
    );
};
