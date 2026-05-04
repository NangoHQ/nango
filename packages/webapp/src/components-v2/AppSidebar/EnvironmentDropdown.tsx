import { Check, ChevronsUpDown, Lock } from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { permissions } from '@nangohq/authz';

import { StyledLink } from '../StyledLink.js';
import { CreateEnvironmentDialog } from './CreateEnvironmentDialog.js';
import { ConditionalTooltip } from '../ConditionalTooltip.js';
import { PermissionGate } from '../PermissionGate.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.js';
import { SidebarMenu, SidebarMenuItem } from '../ui/sidebar.js';
import { LogoInverted } from '@/assets/LogoInverted';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions.js';
import { useStore } from '@/store';

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
                    <DropdownMenuTrigger className="h-fit w-full rounded p-2.5 flex flex-row items-center justify-between cursor-pointer bg-dropdown-bg-default border-[0.5px] border-border-muted hover:bg-dropdown-bg-press hover:border-0 hover:border-l-[0.5px] hover:border-r-[0.5px] hover:border-r-transparent data-[state=closed]:hover:my-[0.5px] data-[state=open]:bg-dropdown-bg-press data-[state=open]:border-[0.5px] data-[state=open]:border-border-muted">
                        <div className="flex gap-2 items-center">
                            <LogoInverted className="h-6 w-6 text-text-primary" />
                            <div className="flex flex-col items-start">
                                <span className="text-body-small-regular leading-3 text-text-secondary">Environment</span>
                                <span className="text-body-medium-semi leading-4 text-text-primary font-semibold truncate max-w-28">{env}</span>
                            </div>
                        </div>
                        <ChevronsUpDown className="w-4.5 h-4.5 text-text-primary" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="bottom" className="w-50 max-h-96 flex flex-col gap-2">
                        <div className="flex flex-col">
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
                                            data-active={env === environment.name}
                                            className="flex flex-row items-center justify-between gap-2 cursor-pointer data-[active=true]:text-text-primary"
                                        >
                                            <div className="flex flex-row items-center gap-2 ">
                                                <Check
                                                    className="w-5 h-5 opacity-0 data-[active=true]:opacity-100 data-[active=true]:text-text-primary"
                                                    data-active={env === environment.name}
                                                />
                                                <span>{environment.name}</span>
                                            </div>
                                            {environment.is_production && <Badge>Prod</Badge>}
                                        </DropdownMenuItem>
                                    )}
                                </PermissionGate>
                            ))}
                        </div>
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
                                                    <StyledLink to={`/${env}/team/billing`} className="text-s">
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
                                        className="w-full"
                                    >
                                        {!!isMaxEnvironmentsReached && <Lock />}
                                        Create Environment
                                    </Button>
                                </ConditionalTooltip>
                            )}
                        </PermissionGate>
                    </DropdownMenuContent>
                </DropdownMenu>
                <CreateEnvironmentDialog open={environmentDialogOpen} onOpenChange={setEnvironmentDialogOpen} />
            </SidebarMenuItem>
        </SidebarMenu>
    );
};
