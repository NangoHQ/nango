import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@nangohq/design-system';

import { Separator } from '@/components/ui/Separator';
import { Skeleton } from '@/components/ui/Skeleton';
import { useOnboardingAccountDiscovery } from '@/hooks/useAuth';
import DefaultLayout from '@/layout/DefaultLayout';

const hearAboutUsRoute = '/onboarding/hear-about-us';

export const AccountDiscovery: React.FC = () => {
    const navigate = useNavigate();
    const { data, isLoading, error } = useOnboardingAccountDiscovery();

    useEffect(() => {
        if (error) {
            navigate(hearAboutUsRoute, { replace: true });
            return;
        }

        if (data && !data.data.suggestedAccountName) {
            navigate(hearAboutUsRoute, { replace: true });
        }
    }, [data, error, navigate]);

    if (isLoading || !data?.data.suggestedAccountName) {
        return (
            <DefaultLayout>
                <div className="mx-auto mt-16 flex max-w-xl flex-col gap-4">
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-10 w-64" />
                </div>
            </DefaultLayout>
        );
    }

    return (
        <DefaultLayout className="gap-10">
            <h1 className="text-center text-text-strong text-title-group">Your team is already on Nango!</h1>
            <div className="flex flex-col items-center gap-5">
                <p className="text-center text-text-muted text-body-base">
                    <strong className="text-text-strong">{data.data.suggestedAccountName}</strong>
                </p>
                <Button variant="outline" size="lg">
                    Request to join
                </Button>
            </div>
            <Separator />
            <span className="cursor-pointer text-center text-text-strong underline hover:text-text-secondary" onClick={() => navigate(hearAboutUsRoute)}>
                Continue with my new account
            </span>
        </DefaultLayout>
    );
};
