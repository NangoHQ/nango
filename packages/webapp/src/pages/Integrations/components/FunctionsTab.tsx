import { Box, Code, ExternalLink, Info } from 'lucide-react';
import { useMemo, useState } from 'react';

import { getDisplayName } from '../utils';
import { StatusWidget } from './StatusWidget';
import { CopyButton } from '@/components-v2/CopyButton';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components-v2/Navigation';
import { StyledLink } from '@/components-v2/StyledLink';
import { Badge } from '@/components-v2/ui/badge';
import { ButtonLink } from '@/components-v2/ui/button';
import { Switch } from '@/components-v2/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components-v2/ui/tooltip';
import { useGetIntegrationFlows } from '@/hooks/useIntegration';
import { useStore } from '@/store';

import type { NangoSyncConfigWithEndpoint } from '../providerConfigKey/Endpoints/components/List';
import type { ApiIntegration, NangoSyncConfig, Provider } from '@nangohq/types';

function groupByGroup(flows: NangoSyncConfig[]): Record<string, NangoSyncConfigWithEndpoint[]> {
    const groups = new Map<string, NangoSyncConfigWithEndpoint[]>();
    for (const flow of flows) {
        for (const endpoint of flow.endpoints) {
            const groupName = endpoint.group || 'others';

            const existingGroup = groups.get(groupName);
            if (!existingGroup) {
                groups.set(groupName, [{ ...flow, endpoint }]);
                continue;
            }

            existingGroup.push({ ...flow, endpoint });
        }
    }
    return Object.fromEntries(groups);
}

interface FunctionsTabProps {
    integration: ApiIntegration;
    provider: Provider;
}

export const FunctionsTab: React.FC<FunctionsTabProps> = ({ integration, provider }) => {
    const env = useStore((state) => state.env);
    const { data, loading } = useGetIntegrationFlows(env, integration.unique_key);

    const [selectedTab, setSelectedTab] = useState<'actions' | 'syncs'>('actions');

    const { actionsByGroup, syncsByGroup } = useMemo(() => {
        const actions = data?.flows.filter((flow) => flow.type === 'action') ?? [];
        const syncs = data?.flows.filter((flow) => flow.type === 'sync') ?? [];
        const actionsByGroup = groupByGroup(actions);
        const syncsByGroup = groupByGroup(syncs);
        return { actionsByGroup, syncsByGroup };
    }, [data?.flows]);

    if (loading) {
        return <div>Loading...</div>;
    }

    return (
        <div className="flex w-full gap-11 justify-between">
            <Navigation
                defaultValue="actions"
                orientation="horizontal"
                className="max-w-2xl"
                onTabChanged={(value) => setSelectedTab(value as 'actions' | 'syncs')}
            >
                <div className="w-full inline-flex items-center gap-2 justify-between">
                    <NavigationList>
                        <NavigationTrigger value="actions">Actions</NavigationTrigger>
                        <NavigationTrigger value="syncs">Syncs</NavigationTrigger>
                    </NavigationList>
                    {selectedTab === 'actions' ? (
                        <ButtonLink to="https://nango.dev/docs/guides/use-cases/actions" target="_blank">
                            How to use Actions <ExternalLink />
                        </ButtonLink>
                    ) : (
                        <ButtonLink to="https://nango.dev/docs/guides/use-cases/syncs" target="_blank">
                            How to use Syncs <ExternalLink />
                        </ButtonLink>
                    )}
                </div>
                <NavigationContent value="actions">
                    <GroupedFunctionsTable groupedFunctions={actionsByGroup} />
                </NavigationContent>
                <NavigationContent value="syncs">
                    <GroupedFunctionsTable groupedFunctions={syncsByGroup} />
                </NavigationContent>
            </Navigation>

            <div className="flex flex-col min-w-30 w-60">
                <InfoRow label="Auth method">
                    <span className="text-text-primary text-body-medium-regular">{getDisplayName(provider.auth_mode)}</span>
                </InfoRow>
                <InfoRow label="Display name">
                    <span className="text-text-primary text-body-medium-regular inline-flex flex-wrap items-baseline gap-1">
                        <span>{integration.display_name || provider.display_name}</span>
                        <CopyButton text={integration.display_name || provider.display_name} />
                    </span>
                </InfoRow>
                <InfoRow label="Integration ID">
                    <span className="text-text-primary text-body-medium-regular inline-flex flex-wrap items-baseline gap-1">
                        <span>{integration.unique_key}</span>
                        <CopyButton text={integration.unique_key} />
                    </span>
                </InfoRow>
                <InfoRow label="API documentation">
                    <span className="text-text-primary text-body-medium-regular inline-flex flex-wrap items-baseline gap-1">
                        <StyledLink to={provider.docs} icon type="external">
                            {provider.display_name}
                        </StyledLink>
                    </span>
                </InfoRow>
                <InfoRow label="API status">
                    <StatusWidget className="text-text-primary" service={integration.provider} />
                </InfoRow>
                <InfoRow label="Created">
                    <span className="text-text-primary text-body-medium-regular inline-flex flex-wrap items-baseline gap-1">
                        {new Date(integration.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                </InfoRow>
            </div>
        </div>
    );
};

const GroupedFunctionsTable: React.FC<{ groupedFunctions: Record<string, NangoSyncConfigWithEndpoint[]> }> = ({ groupedFunctions }) => {
    return (
        <Table>
            {Object.entries(groupedFunctions).map(([groupName, group], index) => (
                <>
                    <TableHeader key={groupName} className="h-8">
                        <TableRow className="h-8">
                            <TableHead className="w-1/3 h-8">{groupName}</TableHead>
                            <TableHead className="h-8">{index === 0 && 'Name'}</TableHead>
                            <TableHead className="h-8">{index === 0 && 'Type'}</TableHead>
                            <TableHead className="h-8 text-center">{index === 0 && 'Enabled'}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {group.map((func) => (
                            <TableRow key={func.id} className="cursor-pointer">
                                <TableCell>
                                    <div className="flex items-center gap-1.5">
                                        {func.name}
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <Info className="size-3.5 text-icon-tertiary cursor-pointer" />
                                            </TooltipTrigger>
                                            <TooltipContent>{func.description}</TooltipContent>
                                        </Tooltip>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <CopyButton text={func.name} />
                                </TableCell>
                                <TableCell>
                                    {func.pre_built ? (
                                        <Badge variant="gray">
                                            <Box />
                                            Template
                                        </Badge>
                                    ) : (
                                        <Badge variant="gray">
                                            <Code /> Custom
                                        </Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-center">
                                    <Switch checked={func.enabled} onCheckedChange={() => {}} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </>
            ))}
        </Table>
    );
};

interface InfoRowProps {
    label: string;
    children: React.ReactNode;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, children }) => {
    return (
        <div className="flex flex-col gap-1 px-5 py-4.5 border-b border-border-muted">
            <span className="text-text-tertiary text-body-medium-regular">{label}</span>
            {children}
        </div>
    );
};
