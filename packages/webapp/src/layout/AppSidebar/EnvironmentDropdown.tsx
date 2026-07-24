import { ChevronsUpDown, Lock } from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { permissions } from '@nangohq/authz';
import { Badge, Button } from '@nangohq/design-system';

import { LogoInverted } from '@/assets/LogoInverted';
import { ConditionalTooltip } from '@/components/patterns/ConditionalTooltip.js';
import { PermissionGate } from '@/components/patterns/PermissionGate.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu.js';
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/Sidebar.js';
import { StyledLink } from '@/components/ui/StyledLink.js';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions.js';
import { useStore } from '@/store';
import { isNonEnvPath } from '@/utils/routes';
import { CreateEnvironmentDialog } from './CreateEnvironmentDialog.js';
import { NavigationItem, navigationItemVariants } from './NavigationItem.js';

export const EnvironmentDropdown: React.FC = () => {
    const env = useStore((state) => state.env);
    const setEnv = useStore((state) => state.setEnv);
    const envs = useStore((state) => state.envs);
    const { data: environmentData } = useEnvironment(env);
    const environment = { plan: environmentData?.plan };
    const { data: metaData } = useMeta();
    const meta = metaData?.data;
    const [environmentDialogOpen, setEnvironmentDialogOpen] = useState(false);

    const { can } = usePermissions();
    const canCreateEnvironment = can(permissions.canCreateEnvironment);

    const navigate = useNavigate();

    const isMaxEnvironmentsReached = envs && environment.plan && envs.length >= environment.plan.environments_max;

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
                                    condition={can(permissions.canAccessProdEnvironment) || !environment.is_production}
                                    message="Your role does not have access to production environments."
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
                        <div className="border-t-[0.5px] border-border-muted p-2 [&_button]:w-full">
                            <PermissionGate condition={canCreateEnvironment} tooltipSide="right">
                                {(allowed) => (
                                    <ConditionalTooltip
                                        condition={!!isMaxEnvironmentsReached}
                                        content={
                                            <>
                                                Max number of environments reached.{' '}
                                                {environment?.plan?.name.includes('legacy') ? (
                                                    <>Contact Nango to add more</>
                                                ) : (
                                                    <>
                                                        <StyledLink to={`/team/billing`} className="text-s">
                                                            Upgrade
                                                        </StyledLink>{' '}
                                                        to add more
                                                    </>
                                                )}
                                            </>
                                        }
                                    >
                                        <Button
                                            disabled={!!isMaxEnvironmentsReached || !allowed}
                                            variant="primary"
                                            onClick={() => {
                                                // Managed control because Dialogs within DropdownMenus behave weirdly
                                                setEnvironmentDialogOpen(true);
                                            }}
                                        >
                                            {!!isMaxEnvironmentsReached && <Lock />}
                                            Create environment
                                        </Button>
                                    </ConditionalTooltip>
                                )}
                            </PermissionGate>
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>
                <CreateEnvironmentDialog open={environmentDialogOpen} onOpenChange={setEnvironmentDialogOpen} />
            </SidebarMenuItem>
        </SidebarMenu>
    );
};
