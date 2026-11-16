import { CircleAlert, Lock } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';

import { Alert, AlertDescription, AlertTitle } from '@nangohq/design-system';

import { Skeleton } from '@/components/ui/Skeleton';
import { useHashNavigation } from '@/hooks/useHashNavigation';
import { usePermissions } from '@/hooks/usePermissions';
import { SecondaryNav, SecondaryNavGroupLabel, SecondaryNavItem } from '@/layout/SecondaryNav';
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
import { Webhooks } from './Webhooks';

import type { ReactNode } from 'react';

interface Section {
    value: string;
    label: string;
    render: (apiKeysResetKey: number) => ReactNode;
    legacyOnly?: boolean;
}

const SECTION_GROUPS: { label: string; sections: Section[] }[] = [
    {
        label: 'Environment',
        sections: [
            { value: 'general', label: 'General', render: () => <General /> },
            { value: 'api-keys', label: 'API keys', render: (apiKeysResetKey) => <ApiKeys key={apiKeysResetKey} /> }
        ]
    },
    {
        label: 'Auth',
        sections: [
            { value: 'auth-callback', label: 'Auth callback', render: () => <BackendSettings /> },
            { value: 'connect-ui', label: 'Connect UI', render: () => <ConnectUISettings /> }
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
            { value: 'function-env-vars', label: 'Functions', render: () => <Functions /> },
            { value: 'telemetry', label: 'Telemetry', render: () => <Telemetry /> },
            { value: 'deprecated', label: 'Legacy auth', render: () => <DeprecatedSettings />, legacyOnly: true }
        ]
    }
];

const DEFAULT_SECTION = SECTION_GROUPS[0].sections[0];

export const EnvironmentSettings: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data: teamData, isError: isTeamError } = useTeam(env);
    const team = teamData?.data;

    const { data, isError: isEnvironmentError } = useEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;
    const [activeTab, setActiveTab] = useHashNavigation(DEFAULT_SECTION.value);
    const [apiKeysResetKey, setApiKeysResetKey] = useState(0);
    const { can } = usePermissions();
    const canEditEnvironment = can('environment:settings:update');
    const scrollRef = useRef<HTMLDivElement>(null);

    const canSeeDeprecatedAuthorization = team ? new Date(team.account.created_at) <= new Date('2025-08-25') : false;
    const visibleGroups = SECTION_GROUPS.map((group) => ({
        ...group,
        sections: group.sections.filter((section) => !section.legacyOnly || canSeeDeprecatedAuthorization)
    }));
    const activeSection = visibleGroups.flatMap((group) => group.sections).find((section) => section.value === activeTab) ?? DEFAULT_SECTION;

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: 0 });
    }, [activeSection.value]);

    const secondaryNav = (
        <SecondaryNav label="Environment settings">
            {visibleGroups.map((group) => (
                <Fragment key={group.label}>
                    <SecondaryNavGroupLabel>{group.label}</SecondaryNavGroupLabel>
                    {group.sections.map((section) => (
                        <SecondaryNavItem
                            key={section.value}
                            isSelected={activeSection.value === section.value}
                            onClick={() => {
                                setActiveTab(section.value);
                                if (section.value === 'api-keys') {
                                    setApiKeysResetKey((k) => k + 1);
                                }
                            }}
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
        if (!environmentAndAccount || !team) {
            return <Skeleton className="h-[280px] w-full" />;
        }
        return <div key={env}>{activeSection.render(apiKeysResetKey)}</div>;
    };

    return (
        <DashboardLayout ref={scrollRef} width="wide" secondaryNav={secondaryNav} className="flex flex-col gap-6">
            <Helmet>
                <title>Environment Settings - Nango</title>
            </Helmet>
            {!canEditEnvironment && (
                <Alert variant="neutral">
                    <Lock />
                    <AlertDescription>You have read-only access to this environment. Ask an admin to change its settings.</AlertDescription>
                </Alert>
            )}
            {renderContent()}
        </DashboardLayout>
    );
};
