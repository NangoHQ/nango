import { LeftNavBarItems } from '../../components/LeftNavBar';
import { Skeleton } from '../../components/ui/Skeleton';
import { useTeam } from '../../hooks/useTeam';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { TeamInfo } from './components/Info';
import { TeamUsers } from './components/Users';
import { AddTeamMember } from './components/AddTeamMember';
import { Admin } from './components/Admin';
import { Helmet } from 'react-helmet';
import { ErrorPageComponent } from '../../components/ErrorComponent';

export const TeamSettings: React.FC = () => {
    const env = useStore((state) => state.env);

    const { error, team, isAdminTeam, loading } = useTeam(env);

    if (loading) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.TeamSettings}>
                <Helmet>
                    <title>Team Settings - Nango</title>
                </Helmet>
                <h2 className="text-3xl font-semibold text-white mb-16">Team Settings</h2>
                <div className="flex flex-col gap-4">
                    <Skeleton className="w-[250px]" />
                    <Skeleton className="w-[250px]" />
                </div>
            </DashboardLayout>
        );
    }

    if (error) {
        return <ErrorPageComponent title="Team Settings" error={error} page={LeftNavBarItems.TeamSettings} />;
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.TeamSettings}>
            <Helmet>
                <title>Team Settings - Nango</title>
            </Helmet>
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-semibold text-white">Team Settings</h2>
                <AddTeamMember team={team!} />
            </div>
            <div className="flex flex-col gap-12 mt-16">
                <TeamInfo />
                <TeamUsers />
                {isAdminTeam && <Admin />}
            </div>
        </DashboardLayout>
    );
};
