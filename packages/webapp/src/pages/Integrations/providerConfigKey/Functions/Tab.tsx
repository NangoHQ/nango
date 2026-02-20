import { Box, Code, ExternalLink, Info } from 'lucide-react';
import { Fragment, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { EmptyCard } from '../../components/EmptyCard.js';
import { FunctionSwitch } from '../../components/FunctionSwitch.js';
import { CopyButton } from '@/components-v2/CopyButton';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components-v2/Navigation';
import { Badge } from '@/components-v2/ui/badge';
import { ButtonLink } from '@/components-v2/ui/button';
import { Skeleton } from '@/components-v2/ui/skeleton.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components-v2/ui/tooltip';
import { useHashNavigation } from '@/hooks/useHashNavigation';
import { useGetIntegrationFlows } from '@/hooks/useIntegration';
import { useStore } from '@/store';

import type { ApiIntegration, NangoSyncConfig } from '@nangohq/types';

function groupByGroup(flows: NangoSyncConfig[]): Record<string, NangoSyncConfig[]> {
    const groups = new Map<string, NangoSyncConfig[]>();
    for (const flow of flows) {
        const groupName = flow.endpoints?.[0]?.group || 'others';

        const existingGroup = groups.get(groupName);
        if (!existingGroup) {
            groups.set(groupName, [flow]);
            continue;
        }

        existingGroup.push(flow);
    }
    return Object.fromEntries(groups);
}

interface FunctionsTabProps {
    integration: ApiIntegration;
}

export const FunctionsTab: React.FC<FunctionsTabProps> = ({ integration }) => {
    const navigate = useNavigate();
    const env = useStore((state) => state.env);
    const { data, isLoading } = useGetIntegrationFlows(env, integration.unique_key);
    const flowsData = data?.data;

    const [activeTab, setActiveTab] = useHashNavigation('actions');

    const { actions, actionsByGroup, syncs, syncsByGroup } = useMemo(() => {
        const actions = flowsData?.flows.filter((flow) => flow.type === 'action') ?? [];
        const syncs = flowsData?.flows.filter((flow) => flow.type === 'sync') ?? [];
        const actionsByGroup = groupByGroup(actions);
        const syncsByGroup = groupByGroup(syncs);
        return { actions, actionsByGroup, syncs, syncsByGroup };
    }, [flowsData?.flows]);

    const onFunctionClick = useCallback(
        (func: NangoSyncConfig) => {
            navigate(`/${env}/integrations/${integration.unique_key}/functions/${func.name}`);
        },
        [env, integration.unique_key, navigate]
    );

    if (isLoading) {
        return <Skeleton className="w-full max-w-2xl h-50" />;
    }

    return (
        <Navigation value={activeTab} onValueChange={setActiveTab} orientation="horizontal" className="max-w-2xl">
            <div className="w-full inline-flex items-center gap-2 justify-between">
                <NavigationList>
                    <NavigationTrigger value="actions">Actions</NavigationTrigger>
                    <NavigationTrigger value="syncs">Syncs</NavigationTrigger>
                </NavigationList>
                {activeTab === 'actions' ? (
                    <ButtonLink variant="secondary" to="https://nango.dev/docs/implementation-guides/use-cases/actions/implement-an-action" target="_blank">
                        How to use Actions <ExternalLink />
                    </ButtonLink>
                ) : (
                    <ButtonLink variant="secondary" to="https://nango.dev/docs/implementation-guides/use-cases/syncs/implement-a-sync" target="_blank">
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
    groupedFunctions: Record<string, NangoSyncConfig[]>;
    onFunctionClick?: (func: NangoSyncConfig) => void;
    integration: ApiIntegration;
}> = ({ groupedFunctions, onFunctionClick, integration }) => {
    return (
        <Table>
            {Object.entries(groupedFunctions).map(([groupName, functions], index) => (
                <Fragment key={groupName}>
                    <TableHeader className="h-8">
                        <TableRow className="h-8">
                            <TableHead className="h-8">{groupName}</TableHead>
                            <TableHead className="h-8">{index === 0 && 'Type'}</TableHead>
                            <TableHead className="h-8 text-center">{index === 0 && 'Enabled'}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {functions.map((func, index) => (
                            <TableRow key={index} className="cursor-pointer hover:bg-bg-subtle" onClick={() => onFunctionClick?.(func)}>
                                <TableCell>
                                    <div className="flex items-center gap-1.5">
                                        {func.name}
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <Info className="size-3.5 text-icon-tertiary cursor-pointer" />
                                            </TooltipTrigger>
                                            <TooltipContent>{func.description}</TooltipContent>
                                        </Tooltip>
                                        <CopyButton text={func.name} />
                                    </div>
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
                                <TableCell>
                                    <div className="flex justify-center items-center">
                                        <FunctionSwitch flow={func} integration={integration} />
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Fragment>
            ))}
        </Table>
    );
};
