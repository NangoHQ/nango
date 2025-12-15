import { Box, Code, ExternalLink, Info } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { EmptyCard } from '../../components/EmptyCard.js';
import { FunctionSwitch } from '../../components/FunctionSwitch.js';
import { CopyButton } from '@/components-v2/CopyButton';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components-v2/Navigation';
import { Badge } from '@/components-v2/ui/badge';
import { ButtonLink } from '@/components-v2/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components-v2/ui/tooltip';
import { useGetIntegrationFlows } from '@/hooks/useIntegration';
import { useStore } from '@/store';

import type { NangoSyncConfigWithEndpoint } from '../Endpoints/components/List.js';
import type { ApiIntegration, NangoSyncConfig } from '@nangohq/types';

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
}

export const FunctionsTab: React.FC<FunctionsTabProps> = ({ integration }) => {
    const navigate = useNavigate();
    const env = useStore((state) => state.env);
    const { data, loading } = useGetIntegrationFlows(env, integration.unique_key);

    const [selectedTab, setSelectedTab] = useState<'actions' | 'syncs'>('actions');

    const { actions, actionsByGroup, syncs, syncsByGroup } = useMemo(() => {
        const actions = data?.flows.filter((flow) => flow.type === 'action') ?? [];
        const syncs = data?.flows.filter((flow) => flow.type === 'sync') ?? [];
        const actionsByGroup = groupByGroup(actions);
        const syncsByGroup = groupByGroup(syncs);
        return { actions, actionsByGroup, syncs, syncsByGroup };
    }, [data?.flows]);

    const onFunctionClick = useCallback(
        (func: NangoSyncConfigWithEndpoint) => {
            navigate(`/${env}/integrations/${integration.unique_key}/functions/${func.name}`);
        },
        [env, integration.unique_key, navigate]
    );

    if (loading) {
        return <div>Loading...</div>;
    }

    return (
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
                    <ButtonLink variant="secondary" to="https://nango.dev/docs/guides/use-cases/actions" target="_blank">
                        How to use Actions <ExternalLink />
                    </ButtonLink>
                ) : (
                    <ButtonLink variant="secondary" to="https://nango.dev/docs/guides/use-cases/syncs" target="_blank">
                        How to use Syncs <ExternalLink />
                    </ButtonLink>
                )}
            </div>
            <NavigationContent value="actions">
                {actions.length > 0 ? (
                    <GroupedFunctionsTable groupedFunctions={actionsByGroup} onFunctionClick={onFunctionClick} integration={integration} />
                ) : (
                    <EmptyCard content="You don't have any actions setup yet." />
                )}
            </NavigationContent>
            <NavigationContent value="syncs">
                {syncs.length > 0 ? (
                    <GroupedFunctionsTable groupedFunctions={syncsByGroup} onFunctionClick={onFunctionClick} integration={integration} />
                ) : (
                    <EmptyCard content="You don't have any syncs setup yet." />
                )}
            </NavigationContent>
        </Navigation>
    );
};

const GroupedFunctionsTable: React.FC<{
    groupedFunctions: Record<string, NangoSyncConfigWithEndpoint[]>;
    onFunctionClick?: (func: NangoSyncConfigWithEndpoint) => void;
    integration: ApiIntegration;
}> = ({ groupedFunctions, onFunctionClick, integration }) => {
    return (
        <Table>
            {Object.entries(groupedFunctions).map(([groupName, functions], index) => (
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
                        {functions.map((func, index) => (
                            <TableRow key={index} className="cursor-pointer" onClick={() => onFunctionClick?.(func)}>
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
                                    <FunctionSwitch flow={func} integration={integration} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </>
            ))}
        </Table>
    );
};
