import { LogOut } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { useNavigate, useParams } from 'react-router-dom';

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Button
} from '@nangohq/design-system';

import { ButtonLink } from '@/components/ui/ButtonLink';
import { StyledLink } from '@/components/ui/StyledLink';
import { useAcceptInvite, useDeclineInvite, useInvite } from '../../hooks/useInvite';
import { useToast } from '../../hooks/useToast';
import { useUser } from '../../hooks/useUser';
import DefaultLayout from '../../layout/DefaultLayout';
import { useSignout } from '../../utils/user';
import { SignupForm } from './components/SignupForm';

export const InviteSignup: React.FC = () => {
    const { token } = useParams();
    const { toast } = useToast();
    const navigate = useNavigate();
    const signout = useSignout();

    const { user: isLogged } = useUser();
    const { data: inviteResponse, error: inviteError, isPending: _isInvitePending } = useInvite(token);
    const acceptInvite = useAcceptInvite();
    const declineInvite = useDeclineInvite();

    const onAccept = async () => {
        try {
            await acceptInvite.mutateAsync({ token: token! });
            toast({ title: `You joined the team`, variant: 'success' });
            navigate('/');
        } catch {
            toast({ title: 'An unexpected error occurred', variant: 'error' });
        }
    };
    const onDecline = async () => {
        try {
            await declineInvite.mutateAsync({ token: token! });
            toast({ title: `You declined the invitation`, variant: 'success' });
            navigate('/');
        } catch {
            toast({ title: 'An unexpected error occurred', variant: 'error' });
        }
    };

    if (inviteError) {
        return (
            <DefaultLayout className="gap-5">
                <Helmet>
                    <title>Invitation Error - Nango</title>
                </Helmet>

                <h2 className="text-title-group text-text-strong">Invitation error</h2>

                <p className="text-text-secondary text-body-medium-regular">
                    An error occurred, refresh your page or reach out to the support.
                    {inviteError.json.error.code === 'generic_error_support' && (
                        <>
                            (id: <span className="select-all">{inviteError.json.error.payload as string}</span>)
                        </>
                    )}
                </p>
            </DefaultLayout>
        );
    }

    if (!inviteResponse) {
        return null;
    }

    if (inviteResponse.status === 400) {
        return (
            <DefaultLayout className="gap-10">
                <Helmet>
                    <title>Invitation Error - Nango</title>
                </Helmet>

                <div className="flex flex-col gap-5 items-center">
                    <h2 className="text-title-group text-text-strong">Invitation error</h2>

                    <p className="text-text-secondary text-body-medium-regular">This invitation no longer exists or is expired.</p>
                </div>

                <ButtonLink to={'/signup'} variant="outline" className="w-full" size="lg">
                    Back to signup
                </ButtonLink>
            </DefaultLayout>
        );
    }

    const inviteData = inviteResponse.json.data;

    if (isLogged && isLogged.email !== inviteData.invitation.email) {
        return (
            <DefaultLayout className="gap-10">
                <Helmet>
                    <title>Invitation Error - Nango</title>
                </Helmet>

                <div className="flex flex-col gap-5 items-center">
                    <h2 className="text-title-group text-text-strong">Invitation error</h2>

                    <p className="text-text-secondary text-body-medium-regular text-center">
                        This invitation was sent to a different email. Please logout and use the correct account.
                    </p>
                </div>

                <div className="flex gap-2 items-center justify-center">
                    <ButtonLink to={'/'} variant="outline" size="lg">
                        Back to home
                    </ButtonLink>
                    <Button onClick={signout} variant="primary" size="lg">
                        <LogOut />
                        Log out
                    </Button>
                </div>
            </DefaultLayout>
        );
    }

    const memberCount = `${inviteData.newTeamUsers} ${inviteData.newTeamUsers > 1 ? 'members' : 'member'}`;

    if (isLogged) {
        return (
            <DefaultLayout className="gap-10">
                <Helmet>
                    <title>Join a team - Nango</title>
                </Helmet>

                <AlertDialog open onOpenChange={() => {}}>
                    <AlertDialogContent size="sm" destructive>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{`Join ${inviteData.newTeam.name}'s team`}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {inviteData.invitedBy.name} has invited you to join their team{' '}
                                <strong className="text-text-strong">{inviteData.newTeam.name}</strong> ({memberCount}). If you accept, you will permanently
                                lose access to your existing team.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <Button variant="outline" size="sm" onClick={onDecline} disabled={acceptInvite.isPending} loading={declineInvite.isPending}>
                                Decline
                            </Button>
                            <Button variant="danger" size="sm" onClick={onAccept} disabled={declineInvite.isPending} loading={acceptInvite.isPending}>
                                Join new team
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </DefaultLayout>
        );
    }

    return (
        <DefaultLayout className="gap-10">
            <Helmet>
                <title>Join a team - Nango</title>
            </Helmet>

            <div className="flex flex-col gap-5 items-center">
                <h2 className="text-title-group text-text-strong">Join a team</h2>

                <div className="flex flex-col gap-2 text-text-secondary text-body-medium-regular text-center">
                    <span>
                        {inviteData.invitedBy.name} has invited you to join their team:
                        <br />
                        <strong className="text-text-strong">{inviteData.newTeam.name}</strong> ({memberCount})
                    </span>
                </div>
            </div>

            <div className="flex flex-col gap-4 items-center w-full">
                <SignupForm invitation={inviteData.invitation} token={token} />
                <span className="text-body-medium-regular text-text-muted">
                    Already have an account? <StyledLink to={`/signin?next=/signup/${token}`}>Log in.</StyledLink>
                </span>
            </div>
        </DefaultLayout>
    );
};
