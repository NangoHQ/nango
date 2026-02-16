import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';

import DefaultLayout from '../../layout/DefaultLayout';
import { useAnalyticsTrack } from '../../utils/analytics';
import { apiFetch } from '../../utils/api';
import { Button } from '@/components-v2/ui/button';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { useToast } from '@/hooks/useToast';

import type { GetOnboardingHearAboutUs, PostOnboardingHearAboutUs } from '@nangohq/types';

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
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (sessionStorage.getItem('show-email-verified-toast') !== 'true') {
            return;
        }

        sessionStorage.removeItem('show-email-verified-toast');
        toast({ title: 'Email verified successfully!', variant: 'success' });
    }, [toast]);

    useEffect(() => {
        const check = async () => {
            const res = await apiFetch('/api/v1/account/onboarding/hear-about-us');
            if (res.status !== 200) {
                navigate('/', { replace: true });
                return;
            }
            const data = (await res.json()) as GetOnboardingHearAboutUs['Success'];
            if (!data.data.showHearAboutUs) {
                navigate('/', { replace: true });
                return;
            }
            setLoading(false);
        };
        void check();
    }, [navigate]);

    const submit = async (source: PostOnboardingHearAboutUs['Body']['source']) => {
        setSubmitting(true);
        analyticsTrack('signup_hear_about', { source });
        const res = await apiFetch('/api/v1/account/onboarding/hear-about-us', {
            method: 'POST',
            body: JSON.stringify({ source })
        });
        setSubmitting(false);
        if (res.status === 200) {
            navigate('/', { replace: true });
        }
    };

    if (loading) {
        return (
            <DefaultLayout>
                <Helmet>
                    <title>How did you hear about Nango? - Nango</title>
                </Helmet>
                <div className="mt-4 flex flex-col items-center justify-center">
                    <Skeleton className="h-8 w-80 bg-bg-subtle" />
                    <div className="mt-10 flex w-full flex-col gap-4">
                        {Array.from({ length: HEAR_ABOUT_OPTIONS.length }).map((_, index) => (
                            <Skeleton key={index} className="h-12 w-full bg-bg-subtle" />
                        ))}
                    </div>
                    <Skeleton className="mt-6 h-5 w-16 bg-bg-subtle" />
                </div>
            </DefaultLayout>
        );
    }

    return (
        <DefaultLayout>
            <Helmet>
                <title>How did you hear about Nango? - Nango</title>
            </Helmet>
            <div className="mt-4 flex flex-col justify-center items-center">
                <h2 className="text-center text-title-group text-text-primary mb-4">How did you hear about Nango?</h2>
                <div className="mt-6 flex w-full flex-col gap-4">
                    {HEAR_ABOUT_OPTIONS.map(({ label, value }) => (
                        <Button
                            variant="secondary"
                            key={value}
                            disabled={submitting}
                            onClick={() => submit(value)}
                            className="w-full bg-bg-subtle p-[12px] h-auto justify-start"
                        >
                            {label}
                        </Button>
                    ))}
                </div>
                <Button
                    variant="ghost"
                    onClick={() => submit('skipped')}
                    disabled={submitting}
                    className="mt-6 text-text-tertiary underline hover:text-text-secondary"
                >
                    Skip
                </Button>
            </div>
        </DefaultLayout>
    );
};
