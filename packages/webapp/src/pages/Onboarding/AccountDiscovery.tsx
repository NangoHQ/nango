import { MailCheck, User, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Alert, AlertDescription, Button } from '@nangohq/design-system';

import { Separator } from '@/components/ui/Separator';
import { Skeleton } from '@/components/ui/Skeleton';
import { useOnboardingAccountDiscovery, usePostOnboardingRequestInvite } from '@/hooks/useAuth';
import { useUser } from '@/hooks/useUser';
import DefaultLayout from '@/layout/DefaultLayout';
import { track } from '@/utils/analytics';
import { APIError } from '@/utils/api';
import { cn } from '@/utils/utils';

const hearAboutUsRoute = '/onboarding/hear-about-us';

type Choice = 'join' | 'create';

// account.service.ts adds this suffix to every name at signup. Keep the two in sync.
function toDisplayTeamName(accountName: string): string {
    return accountName.replace(/'s Team$/, '') || accountName;
}

export const AccountDiscovery: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useUser();
    const { data, isLoading, error } = useOnboardingAccountDiscovery();
    const { mutateAsync: requestInvite, isPending: isRequestingInvite } = usePostOnboardingRequestInvite();
    const [requestError, setRequestError] = useState<'retry' | 'contact_admin' | null>(null);
    const [requestSent, setRequestSent] = useState(false);

    const createOwnAccount = () => {
        void navigate(hearAboutUsRoute);
    };

    const requestToJoin = async () => {
        setRequestError(null);
        try {
            await requestInvite();
            track('auth:join_request_submit', {});
            setRequestSent(true);
        } catch (err) {
            setRequestError(err instanceof APIError && err.json.error?.code === 'email_delivery_failed' ? 'retry' : 'contact_admin');
        }
    };

    useEffect(() => {
        if (error) {
            navigate(hearAboutUsRoute, { replace: true });
            return;
        }

        if (data && !data.data.suggestedAccountName) {
            // If there are no recommendations, redirect the user to hear-about-us:
            navigate(hearAboutUsRoute, { replace: true });
        }
    }, [data, error, navigate]);

    if (isLoading || !data?.data.suggestedAccountName) {
        return <AccountDiscoveryLoading />;
    }

    const teamName = toDisplayTeamName(data.data.suggestedAccountName);

    return (
        <DefaultLayout wide className="items-start">
            {requestSent ? (
                <RequestSent teamName={teamName} email={user?.email} onCreateOwnAccount={createOwnAccount} />
            ) : (
                <ChooseHowToStart
                    teamName={teamName}
                    requestError={requestError}
                    isRequestingInvite={isRequestingInvite}
                    onRequestToJoin={requestToJoin}
                    onCreateOwnAccount={createOwnAccount}
                />
            )}
        </DefaultLayout>
    );
};

const AccountDiscoveryLoading: React.FC = () => (
    <DefaultLayout wide className="items-start gap-8">
        <div className="flex w-full flex-col gap-2">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-5 w-full" />
        </div>
        <div className="flex w-full flex-col gap-4">
            <Skeleton className="h-18 w-full" />
            <Skeleton className="h-14 w-full" />
        </div>
        <Skeleton className="h-9 w-full" />
    </DefaultLayout>
);

const ChooseHowToStart: React.FC<{
    teamName: string;
    requestError: 'retry' | 'contact_admin' | null;
    isRequestingInvite: boolean;
    onRequestToJoin: () => Promise<void>;
    onCreateOwnAccount: () => void;
}> = ({ teamName, requestError, isRequestingInvite, onRequestToJoin, onCreateOwnAccount }) => {
    const [choice, setChoice] = useState<Choice>('create');

    const submit = () => {
        if (choice === 'join') {
            void onRequestToJoin();
            return;
        }
        onCreateOwnAccount();
    };

    return (
        <div className="flex w-full min-w-0 flex-col gap-8 wrap-anywhere">
            <div className="flex flex-col gap-2">
                <h1 className="text-heading-large text-text-strong">Your team at {teamName} already uses Nango</h1>
                <p className="text-heading-sm leading-[1.4] text-text-secondary">
                    Choose how you want to get started. You can create your own account now and still join your team later.
                </p>
            </div>
            <fieldset className="flex flex-col gap-4">
                <legend className="sr-only">How do you want to get started?</legend>
                <ChoiceCard
                    value="join"
                    selected={choice === 'join'}
                    onSelect={setChoice}
                    icon={<Users className="size-4 shrink-0" />}
                    title={`Join the ${teamName} team`}
                    description={`We’ll ask ${teamName}’s admins to invite you. You’ll get access to the team’s account once one of them approves.`}
                />
                <ChoiceCard
                    value="create"
                    selected={choice === 'create'}
                    onSelect={setChoice}
                    icon={<User className="size-4 shrink-0" />}
                    title="Create my own account"
                    description="Start building right away with a new Nango account."
                />
            </fieldset>
            {choice === 'join' && requestError === 'retry' && (
                <Alert variant="danger">
                    <AlertDescription>We couldn&apos;t send your request. Please try again.</AlertDescription>
                </Alert>
            )}
            {choice === 'join' && requestError === 'contact_admin' && (
                <Alert variant="danger">
                    <AlertDescription>Please ask a team administrator to invite you directly.</AlertDescription>
                </Alert>
            )}
            <div className="flex flex-col">
                <Button size="lg" loading={isRequestingInvite} onClick={submit}>
                    <span className="truncate">{choice === 'join' ? `Request to join ${teamName}` : 'Create my account'}</span>
                </Button>
            </div>
        </div>
    );
};

const ChoiceCard: React.FC<{
    value: Choice;
    selected: boolean;
    onSelect: (value: Choice) => void;
    icon: React.ReactNode;
    title: string;
    description: string;
}> = ({ value, selected, onSelect, icon, title, description }) => (
    <label
        className={cn(
            'flex cursor-pointer gap-4 rounded-xs border-[0.5px] bg-surface-panel px-4 py-3 transition-colors has-[:focus-visible]:shadow-focus-outline-default',
            selected ? 'border-border-selected shadow-xs' : 'border-border-default hover:border-border-strong'
        )}
    >
        <input type="radio" name="account-choice" value={value} checked={selected} onChange={() => onSelect(value)} className="sr-only" />
        <span
            aria-hidden
            className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                selected ? 'border-border-selected' : 'border-border-input'
            )}
        >
            {selected && <span className="size-2 rounded-full bg-border-selected" />}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-1.5 text-body-medium-medium text-text-strong">
                {icon}
                {title}
            </span>
            <span className="text-[13px] leading-normal text-text-secondary">{description}</span>
        </span>
    </label>
);

const RequestSent: React.FC<{ teamName: string; email: string | undefined; onCreateOwnAccount: () => void }> = ({ teamName, email, onCreateOwnAccount }) => (
    <div className="flex w-full min-w-0 flex-col gap-8 wrap-anywhere">
        <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-status-success-bg text-icon-success">
                <MailCheck className="size-5" />
            </span>
            <h1 className="text-heading-large text-text-strong">Request sent to {teamName}’s admins</h1>
        </div>
        <div className="flex flex-col gap-[1.4em] text-heading-sm leading-[1.4] text-text-secondary">
            <p>
                We emailed the admins of the {teamName} team. As soon as one of them approves, you’ll receive an invitation
                {email ? (
                    <>
                        {' '}
                        at <span className="text-text-strong">{email}</span>
                    </>
                ) : null}
                . You can now close this page.
            </p>
            <p>Want it faster? Ask a teammate who manages Nango at {teamName} to approve your request.</p>
        </div>
        <Separator />
        <div className="flex items-center gap-3">
            <span className="text-body-medium-regular text-text-secondary">Changed your mind?</span>
            <Button variant="outline" onClick={onCreateOwnAccount}>
                Create my own account instead
            </Button>
        </div>
    </div>
);
