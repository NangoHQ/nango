import { CircleAlert, Lock } from 'lucide-react';
import { Fragment, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';

import { Alert, AlertDescription, AlertTitle } from '@nangohq/design-system';

import { Skeleton } from '@/components/ui/Skeleton';
import { usePermissions } from '@/hooks/usePermissions';
import { SecondaryNav, SecondaryNavGroupLabel, SecondaryNavItem } from '@/layout/SecondaryNav';
import { cn } from '@/utils/utils';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { useTeam } from '../../../hooks/useTeam';
import DashboardLayout from '../../../layout/DashboardLayout';
import { useStore } from '../../../store';
import { ApiKeys } from './ApiKeys';
import { BackendSettings } from './Backend';
import { ConnectUISettings } from './ConnectUISettings';
import { DeprecatedSettings } from './Deprecated';
import { Functions } from './Functions';
import { General } from './General';
import { SlackAlertsSettings } from './SlackAlerts';
import { Telemetry } from './Telemetry';
import { settingsPath } from './utils';
import { Webhooks } from './Webhooks';

import type { ReactNode } from 'react';

interface Section {
    value: string;
    label: string;
    render: (subPath: string | undefined) => ReactNode;
    legacyOnly?: boolean;
    wide?: boolean;
}

const SECTION_GROUPS: { label: string; sections: Section[] }[] = [
    {
        label: 'Environment',
        sections: [
            { value: 'general', label: 'General', render: () => <General /> },
            { value: 'api-keys', label: 'API keys', render: (subPath) => <ApiKeys subPath={subPath} />, wide: true }
        ]
    },
    {
        label: 'Auth',
        sections: [
            { value: 'auth-callback', label: 'Auth callback', render: () => <BackendSettings /> },
            { value: 'connect-ui', label: 'Connect UI', render: () => <ConnectUISettings />, wide: true }
        ]
    },
    {
        label: 'Notifications',
        sections: [
            { value: 'webhooks', label: 'Webhooks', render: () => <Webhooks /> },
            { value: 'slack-alerts', label: 'Slack alerts', render: () => <SlackAlertsSettings /> }
        ]
    },
    {
        label: 'Advanced',
        sections: [
            { value: 'functions', label: 'Functions', render: () => <Functions /> },
            { value: 'otel-export', label: 'OTel export', render: () => <Telemetry /> },
            { value: 'legacy-auth', label: 'Legacy auth', render: () => <DeprecatedSettings />, legacyOnly: true }
        ]
    }
];

const DEFAULT_SECTION = SECTION_GROUPS[0].sections[0];

// The public docs link to these names, so removing one breaks their links.
const LEGACY_SECTION_NAMES: Record<string, string> = {
    'function-env-vars': 'functions',
    telemetry: 'otel-export',
    deprecated: 'legacy-auth',
    notification: 'webhooks'
};

export const EnvironmentSettings: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data: teamData, isError: isTeamError } = useTeam(env);
    const team = teamData?.data;

    const { data, isError: isEnvironmentError } = useEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;
    const { can } = usePermissions();
    const canEditEnvironment = can('environment:settings:update');
    const scrollRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const location = useLocation();

    const { section: sectionSlug, subPath } = useParams();

    const canSeeDeprecatedAuthorization = team ? new Date(team.account.created_at) <= new Date('2025-08-25') : false;
    const visibleGroups = SECTION_GROUPS.map((group) => ({
        ...group,
        sections: group.sections.filter((section) => !section.legacyOnly || canSeeDeprecatedAuthorization)
    }));
    const activeSection = visibleGroups.flatMap((group) => group.sections).find((section) => section.value === sectionSlug);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: 0 });
    }, [sectionSlug, subPath]);

    if (!sectionSlug && location.hash) {
        const hashSection = location.hash.slice(1);
        return <Navigate replace to={{ pathname: settingsPath(env, LEGACY_SECTION_NAMES[hashSection] ?? hashSection), search: location.search }} />;
    }
    if (sectionSlug && LEGACY_SECTION_NAMES[sectionSlug]) {
        return <Navigate replace to={settingsPath(env, LEGACY_SECTION_NAMES[sectionSlug])} />;
    }
    // The legacy section is only known once the team has loaded, so wait for it before redirecting.
    if (!activeSection && (team || isTeamError)) {
        return <Navigate replace to={settingsPath(env, DEFAULT_SECTION.value)} />;
    }

    const secondaryNav = (
        <SecondaryNav label="Environment settings">
            {visibleGroups.map((group) => (
                <Fragment key={group.label}>
                    <SecondaryNavGroupLabel>{group.label}</SecondaryNavGroupLabel>
                    {group.sections.map((section) => (
                        <SecondaryNavItem
                            key={section.value}
                            isSelected={activeSection?.value === section.value}
                            onClick={() => void navigate(settingsPath(env, section.value))}
                        >
                            {section.label}
                        </SecondaryNavItem>
                    ))}
                </Fragment>
            ))}
        </SecondaryNav>
    );

    const renderContent = () => {
        if ((isEnvironmentError && !environmentAndAccount) || (isTeamError && !team)) {
            return (
                <Alert variant="danger">
                    <CircleAlert />
                    <AlertTitle>Couldn&apos;t load environment settings</AlertTitle>
                    <AlertDescription>Refresh the page to try again.</AlertDescription>
                </Alert>
            );
        }
        if (!environmentAndAccount || !team || !activeSection) {
            return <Skeleton className="h-[280px] w-full" />;
        }
        return <div key={env}>{activeSection.render(subPath)}</div>;
    };

    return (
        <DashboardLayout ref={scrollRef} width="wide" secondaryNav={secondaryNav} className="flex flex-col gap-6 px-10 pt-8 pb-24">
            <Helmet>
                <title>Environment Settings - Nango</title>
            </Helmet>
            <div className={cn('flex w-full flex-col gap-5', activeSection?.wide ? 'max-w-280' : 'max-w-205')}>
                {!canEditEnvironment && (
                    <Alert variant="info">
                        <Lock />
                        <AlertTitle>Read-only access</AlertTitle>
                        <AlertDescription>Only admins can change settings.</AlertDescription>
                    </Alert>
                )}
                {renderContent()}
            </div>
        </DashboardLayout>
    );
};
