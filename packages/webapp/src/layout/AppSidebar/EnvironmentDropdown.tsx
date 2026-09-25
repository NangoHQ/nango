import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { ArrowUpRight, ChevronsUpDown, TriangleAlert } from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Alert, AlertActions, AlertDescription, Badge, Button } from '@nangohq/design-system';

import { LogoInverted } from '@/assets/LogoInverted';
import { PermissionGate } from '@/components/patterns/PermissionGate.js';
import { AlertButtonLink } from '@/components/ui/AlertButtonLink';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu.js';
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/Sidebar.js';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions.js';
import { useCurrentPlan } from '@/hooks/usePlan';
import { isLegacyPlan } from '@/pages/Team/Billing/planVisibility';
import { useStore } from '@/store';
import { isNonEnvPath } from '@/utils/routes';
import { CreateEnvironmentDialog } from './CreateEnvironmentDialog.js';
import { NavigationItem, navigationItemVariants } from './NavigationItem.js';

export const EnvironmentDropdown: React.FC = () => {
    const env = useStore((state) => state.env);
    const setEnv = useStore((state) => state.setEnv);
    const envs = useStore((state) => state.envs);
    const { data: environmentData } = useCurrentPlan(env);
    const plan = environmentData?.plan;
    const { data: metaData } = useMeta();
    const meta = metaData?.data;
    const [environmentDialogOpen, setEnvironmentDialogOpen] = useState(false);

    const { can } = usePermissions();
    const canCreateEnvironment = can('account:environments:create');

    const navigate = useNavigate();

    const isMaxEnvironmentsReached = envs && plan && envs.length >= plan.environments_max;
    const isLegacy = isLegacyPlan(plan);

    const onSelect = (selected: string) => {
        if (selected === env) {
            return;
        }

        setEnv(selected);

        const pathSegments = window.location.pathname.split('/').filter(Boolean);

        // Non-environment-specific pages — just update env in store, don't change URL
        if (isNonEnvPath(window.location.pathname)) {
            return;
        }

        pathSegments[0] = selected;

        let newPath = `/${pathSegments.join('/')}`;

        // If on 'integration' or 'connections' subpages beyond the second level, redirect to their parent page
        if (pathSegments[1] === 'integrations' && pathSegments.length > 2) {
            newPath = `/${selected}/integrations`;
        } else if (pathSegments[1] === 'connections' && pathSegments.length > 2) {
            newPath = `/${selected}/connections`;
        }

        navigate(newPath);
    };

    if (!meta) {
        return;
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger className="focus-inset flex h-14 w-full cursor-pointer flex-row items-center justify-between border-b-[0.5px] border-border-default px-4 outline-none transition-colors hover:bg-state-hover data-[state=open]:bg-surface-overlay">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-[2px] border-[0.5px] border-border-default bg-surface-overlay">
                                <LogoInverted className="size-5 text-text-strong" />
                            </div>
                            <div className="flex min-w-0 flex-col items-start">
                                <span className="type-text-regular-xs text-text-muted">Environment</span>
                                <span className="type-text-medium-sm max-w-28 truncate text-text-default">{env}</span>
                            </div>
                        </div>
                        <ChevronsUpDown className="size-4 shrink-0 text-icon-secondary" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="start"
                        side="bottom"
                        sideOffset={0}
                        className="flex max-h-96 w-(--radix-dropdown-menu-trigger-width) flex-col rounded-none border-0 border-b-[0.5px] border-border-default p-0"
                    >
                        <div className="flex flex-col px-1 pt-1">
                            {meta?.environments.map((environment) => (
                                <PermissionGate
                                    key={environment.name}
                                    condition={can('environment:settings:read', environment)}
                                    message="Your role does not have access to this environment."
                                    tooltipSide="right"
                                >
                                    {(allowed) => (
                                        <DropdownMenuItem
                                            disabled={!allowed}
                                            onSelect={() => onSelect(environment.name)}
                                            className={navigationItemVariants({ selected: env === environment.name })}
                                        >
                                            <NavigationItem trailing={environment.is_production && <Badge variant="brand">Prod</Badge>}>
                                                {environment.name}
                                            </NavigationItem>
                                        </DropdownMenuItem>
                                    )}
                                </PermissionGate>
                            ))}
                        </div>
                        <div className="flex flex-col gap-2 border-t-[0.5px] border-border-muted p-2">
                            <PermissionGate condition={canCreateEnvironment} tooltipSide="right">
                                {(allowed) => (
                                    <div className="flex flex-col">
                                        <Button
                                            disabled={!allowed || !!isMaxEnvironmentsReached}
                                            variant="primary"
                                            onClick={() => {
                                                // Managed control because Dialogs within DropdownMenus behave weirdly
                                                setEnvironmentDialogOpen(true);
                                            }}
                                        >
                                            Create environment
                                        </Button>
                                    </div>
                                )}
                            </PermissionGate>
                            {canCreateEnvironment && isMaxEnvironmentsReached && (
                                <Alert variant="warning" size="compact">
                                    <TriangleAlert />
                                    <AlertDescription>
                                        Max number of environments reached. {isLegacy ? 'Contact Nango to add more.' : 'Upgrade for more.'}
                                    </AlertDescription>
                                    {!isLegacy && (
                                        <AlertActions>
                                            {/* Unwrapped, the link can't be reached by keyboard while the menu is open. */}
                                            {/* Radix focuses items on hover; preventing it keeps the focus ring keyboard-only. */}
                                            <DropdownMenuPrimitive.Item asChild onPointerMove={(event) => event.preventDefault()}>
                                                <AlertButtonLink to="/team/billing#plans">
                                                    Upgrade <ArrowUpRight />
                                                </AlertButtonLink>
                                            </DropdownMenuPrimitive.Item>
                                        </AlertActions>
                                    )}
                                </Alert>
                            )}
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>
                <CreateEnvironmentDialog open={environmentDialogOpen} onOpenChange={setEnvironmentDialogOpen} />
            </SidebarMenuItem>
        </SidebarMenu>
    );
};
