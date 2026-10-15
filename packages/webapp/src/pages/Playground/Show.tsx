import { Bot, ChevronLeft, Code } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, Navigate, Outlet, useLocation, useMatch, useOutletContext } from 'react-router-dom';

import { SegmentedNav } from '@/components/ui/SegmentedNav';
import { trackPlaygroundOpened } from '@/features/Playground/analytics';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';
import { usePlaygroundTabs } from './usePlaygroundTabs';

import type { PlaygroundTab } from './usePlaygroundTabs';
import type { PlaygroundLocationState } from '@/utils/playground';
import type { LucideIcon } from 'lucide-react';

const TAB_OPTIONS: { value: PlaygroundTab; label: string; Icon: LucideIcon }[] = [
    { value: 'agent', label: 'Agent', Icon: Bot },
    { value: 'functions', label: 'Functions', Icon: Code }
];

interface PlaygroundOutletContext {
    toolbarSlot: HTMLElement | null;
}

export function usePlaygroundToolbarSlot(): HTMLElement | null {
    return useOutletContext<PlaygroundOutletContext>().toolbarSlot;
}

export const PlaygroundShow: React.FC = () => {
    const env = useStore((s) => s.env);
    const location = useLocation();
    const { ready, tabs } = usePlaygroundTabs();
    const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);
    const back = (location.state as PlaygroundLocationState | null)?.back;
    const tabState: PlaygroundLocationState = back ? { back } : {};

    const tabParam = useMatch('/:env/playground/:tab')?.params.tab;
    const tab = TAB_OPTIONS.find((option) => option.value === tabParam)?.value;

    const functionsShown = tab === 'functions' && tabs.includes('functions');
    useEffect(() => {
        if (functionsShown && !back) {
            trackPlaygroundOpened('playground');
        }
    }, [functionsShown, back]);

    if (!ready) {
        return null;
    }

    if (tabs.length === 0) {
        return (
            <DashboardLayout title="Playground">
                <p className="text-text-secondary">{`Your role can't use the Playground in this environment.`}</p>
            </DashboardLayout>
        );
    }

    if (!tab || !tabs.includes(tab)) {
        return <Navigate to={`/${env}/playground/${tabs[0]}`} state={tabState} replace />;
    }

    return (
        <DashboardLayout fullWidth className="h-full" title="Playground">
            <Helmet>
                <title>Playground - Nango</title>
            </Helmet>
            <div className="flex h-full flex-col gap-6">
                <div className="flex flex-col gap-4">
                    {back && (
                        <Link
                            to={back.to}
                            className="inline-flex w-fit items-center gap-1 text-body-medium-medium text-text-secondary hover:text-text-strong focus-default"
                        >
                            <ChevronLeft className="size-4" />
                            Back to {back.label}
                        </Link>
                    )}
                    <div ref={setToolbarSlot} className="flex items-center justify-between gap-2 empty:hidden">
                        {tabs.length > 1 && (
                            <SegmentedNav
                                aria-label="Playground mode"
                                value={tab}
                                state={tabState}
                                options={TAB_OPTIONS.filter((option) => tabs.includes(option.value)).map((option) => ({
                                    ...option,
                                    to: `/${env}/playground/${option.value}`
                                }))}
                            />
                        )}
                    </div>
                </div>
                <div className="min-h-0 flex-1">
                    <Outlet context={{ toolbarSlot } satisfies PlaygroundOutletContext} />
                </div>
            </div>
        </DashboardLayout>
    );
};
