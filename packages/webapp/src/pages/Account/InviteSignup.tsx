import { LogOut } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { useNavigate, useParams } from 'react-router-dom';

import { SignupForm } from './components/SignupForm';
import { useAcceptInvite, useDeclineInvite, useInvite } from '../../hooks/useInvite';
import { useToast } from '../../hooks/useToast';
import { useUser } from '../../hooks/useUser';
import DefaultLayout from '../../layout/DefaultLayout';
import { useSignout } from '../../utils/user';
import { StyledLink } from '@/components-v2/StyledLink';
import { Button, ButtonLink } from '@/components-v2/ui/button';

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

                <h2 className="text-title-group text-text-primary">Invitation error</h2>

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
                    <h2 className="text-title-group text-text-primary">Invitation error</h2>

                    <p className="text-text-secondary text-body-medium-regular">This invitation no longer exists or is expired.</p>
                </div>

                <ButtonLink to={'/signup'} variant="secondary" className="w-full" size="lg">
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
                    <h2 className="text-title-group text-text-primary">Invitation error</h2>

                    <p className="text-text-secondary text-body-medium-regular text-center">
                        This invitation was sent to a different email. Please logout and use the correct account.
                    </p>
                </div>

                <div className="flex gap-2 items-center justify-center">
                    <ButtonLink to={'/'} variant="secondary" size="lg">
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

    return (
        <DefaultLayout className="gap-10">
            <Helmet>
                <title>Invitation Error - Nango</title>
            </Helmet>

            <div className="flex flex-col gap-5 items-center">
                <h2 className="text-title-group text-text-primary">{isLogged ? 'Request to join a different team' : 'Join a team'}</h2>

                <div className="flex flex-col gap-2 text-text-secondary text-body-medium-regular text-center">
                    <span>
                        {inviteData.invitedBy.name} has invited you to join their team:
                        <br />
                        <strong className="text-text-primary">{inviteData.newTeam.name}</strong> ({inviteData.newTeamUsers}
                        {inviteData.newTeamUsers > 1 ? ' members' : ' member'})
                    </span>

                    {isLogged && <span> If you accept, you will permanently lose access to your existing team.</span>}
                </div>
            </div>

            {isLogged ? (
                <div className="flex gap-2 items-center justify-center">
                    <Button variant="secondary" size="lg" onClick={onDecline} disabled={acceptInvite.isPending} loading={declineInvite.isPending}>
                        Decline
                    </Button>
                    <Button variant="destructive" size="lg" onClick={onAccept} disabled={declineInvite.isPending} loading={acceptInvite.isPending}>
                        Join a different team
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col gap-4 items-center w-full">
                    <SignupForm invitation={inviteData.invitation} token={token} />
                    <span className="text-body-medium-regular text-text-tertiary">
                        Already have an account? <StyledLink to="/signin">Log in.</StyledLink>
                    </span>
                </div>
            )}
        </DefaultLayout>
    );
};
