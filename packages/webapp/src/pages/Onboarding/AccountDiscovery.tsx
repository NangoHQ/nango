import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Alert, AlertDescription, Button } from '@nangohq/design-system';

import { Separator } from '@/components/ui/Separator';
import { Skeleton } from '@/components/ui/Skeleton';
import { useOnboardingAccountDiscovery, usePostOnboardingRequestInvite } from '@/hooks/useAuth';
import DefaultLayout from '@/layout/DefaultLayout';
import { track } from '@/utils/analytics';
import { APIError } from '@/utils/api';

const hearAboutUsRoute = '/onboarding/hear-about-us';

export const AccountDiscovery: React.FC = () => {
    const navigate = useNavigate();
    const { data, isLoading, error } = useOnboardingAccountDiscovery();
    const { mutateAsync: requestInvite, isPending: isRequestingInvite } = usePostOnboardingRequestInvite();
    const [requestError, setRequestError] = useState<'retry' | 'contact_admin' | null>(null);
    const [requestSent, setRequestSent] = useState(false);

    const requestToJoin = async () => {
        setRequestError(null);
        try {
            await requestInvite();
            track('web:account_join_request:submitted', {});
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

    return (
        <DefaultLayout className="gap-10">
            <h1 className="text-center text-text-strong text-title-group">Your team is already on Nango!</h1>
            {requestSent ? (
                <InvitationRequestSent onExploreTemporaryAccount={() => navigate(hearAboutUsRoute)} />
            ) : (
                <InvitationRequestPrompt
                    suggestedAccountName={data.data.suggestedAccountName}
                    requestError={requestError}
                    isRequestingInvite={isRequestingInvite}
                    onRequest={requestToJoin}
                    onContinueWithNewAccount={() => navigate(hearAboutUsRoute)}
                />
            )}
        </DefaultLayout>
    );
};

const AccountDiscoveryLoading: React.FC = () => (
    <DefaultLayout>
        <div className="mx-auto mt-16 flex max-w-xl flex-col gap-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-10 w-64" />
        </div>
    </DefaultLayout>
);

const InvitationRequestPrompt: React.FC<{
    suggestedAccountName: string;
    requestError: 'retry' | 'contact_admin' | null;
    isRequestingInvite: boolean;
    onRequest: () => Promise<void>;
    onContinueWithNewAccount: () => void;
}> = ({ suggestedAccountName, requestError, isRequestingInvite, onRequest, onContinueWithNewAccount }) => (
    <div className="flex flex-col items-center gap-5">
        <p className="text-center text-text-muted text-body-base">
            <strong className="text-text-strong">{suggestedAccountName}</strong>
        </p>
        {requestError === 'retry' && (
            <Alert variant="danger">
                <AlertDescription>We couldn&apos;t send your request. Please try again.</AlertDescription>
            </Alert>
        )}
        {requestError === 'contact_admin' && (
            <Alert variant="danger">
                <AlertDescription>Please ask a team administrator to invite you directly.</AlertDescription>
            </Alert>
        )}
        <Button variant="outline" size="lg" loading={isRequestingInvite} onClick={() => void onRequest()}>
            Request to join
        </Button>
        <Separator />
        <IntoAccountLink onClick={onContinueWithNewAccount}>Continue with my new account</IntoAccountLink>
    </div>
);

const InvitationRequestSent: React.FC<{ onExploreTemporaryAccount: () => void }> = ({ onExploreTemporaryAccount }) => (
    <div className="flex flex-col items-center gap-5">
        <Alert variant="success">
            <AlertDescription>
                {/* stacked and centred on a wrapper, since AlertDescription lays its children out inline */}
                <div className="flex flex-col items-center text-center">
                    <span>Your invitation request has been sent!</span>
                    <span>You can explore Nango on your temporary account in the meantime.</span>
                </div>
            </AlertDescription>
        </Alert>
        <IntoAccountLink onClick={onExploreTemporaryAccount}>Explore with my temporary account</IntoAccountLink>
    </div>
);

const IntoAccountLink: React.FC<{ children: React.ReactNode; onClick: () => void }> = ({ children, onClick }) => (
    <span className="cursor-pointer text-center text-text-strong underline hover:text-text-secondary" onClick={onClick}>
        {children}
    </span>
);
