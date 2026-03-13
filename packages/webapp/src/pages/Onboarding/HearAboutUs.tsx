import { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';

import { useOnboardingHearAboutUs, usePostOnboardingHearAboutUs } from '../../hooks/useAuth';
import DefaultLayout from '../../layout/DefaultLayout';
import { useAnalyticsTrack } from '../../utils/analytics';
import { Button } from '@/components-v2/ui/button';
import { Skeleton } from '@/components-v2/ui/skeleton';

import type { PostOnboardingHearAboutUs } from '@nangohq/types';

const HEAR_ABOUT_OPTIONS: { label: string; value: PostOnboardingHearAboutUs['Body']['source'] }[] = [
    { label: 'My team is already using Nango', value: 'my_team_already_using' },
    { label: 'Recommended by someone I know', value: 'recommended' },
    { label: 'Search engine (Google, etc.)', value: 'search_engine' },
    { label: 'LLM search (ChatGPT, Claude, etc.)', value: 'llm_search' },
    { label: 'Social media (LinkedIn, Hackernews, etc.)', value: 'social_media' },
    { label: "Don't remember", value: 'dont_remember' },
    { label: 'Other (no details required)', value: 'other' }
];

export const HearAboutUs: React.FC = () => {
    const navigate = useNavigate();
    const analyticsTrack = useAnalyticsTrack();

    const { data, isLoading, error } = useOnboardingHearAboutUs();
    const { mutateAsync: postHearAboutUs, isPending } = usePostOnboardingHearAboutUs();

    useEffect(() => {
        if (error) {
            navigate('/', { replace: true });
            return;
        }
        if (data && !data.data.showHearAboutUs) {
            navigate('/', { replace: true });
        }
    }, [data, error, navigate]);

    const submit = async (source: PostOnboardingHearAboutUs['Body']['source']) => {
        analyticsTrack('signup_hear_about', { source });
        try {
            await postHearAboutUs({ source });
        } finally {
            // Don't block on errors as this is not critical
            navigate('/', { replace: true });
        }
    };

    if (isLoading) {
        return (
            <DefaultLayout className="gap-10">
                <Helmet>
                    <title>How did you hear about Nango? - Nango</title>
                </Helmet>

                <Skeleton className="h-6 w-80 bg-bg-subtle" />

                <div className="flex w-full flex-col gap-4">
                    {Array.from({ length: HEAR_ABOUT_OPTIONS.length }).map((_, index) => (
                        <Skeleton key={index} className="h-12 w-full bg-bg-subtle" />
                    ))}
                </div>

                <Skeleton className="h-5 w-32 bg-bg-subtle" />
            </DefaultLayout>
        );
    }

    return (
        <DefaultLayout className="gap-10">
            <Helmet>
                <title>How did you hear about Nango? - Nango</title>
            </Helmet>

            <h2 className="text-center text-title-group text-text-primary">How did you hear about Nango?</h2>

            <div className="flex w-full flex-col gap-4">
                {HEAR_ABOUT_OPTIONS.map(({ label, value }) => (
                    <Button
                        variant="secondary"
                        key={value}
                        loading={isPending}
                        onClick={() => submit(value)}
                        className="w-full bg-bg-subtle p-3 h-auto justify-start"
                    >
                        {label}
                    </Button>
                ))}
            </div>

            <span className="text-body-medium-regular text-text-tertiary">
                Not sure?{' '}
                <span className="text-text-primary underline hover:text-text-secondary cursor-pointer" onClick={() => submit('skipped')}>
                    Skip for now
                </span>
            </span>
        </DefaultLayout>
    );
};
