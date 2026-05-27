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
import { LogoInverted } from '@/assets/LogoInverted';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions.js';
import { useStore } from '@/store';
import { isNonEnvPath } from '@/utils/routes';

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

        if (isNonEnvPath(window.location.pathname)) {
            return;
        }

        pathSegments[0] = selected;

        let newPath = `/${pathSegments.join('/')}`;

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
        <>
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger className="flex h-14 w-full cursor-pointer items-center justify-between border-b border-[color:var(--border-default)] bg-transparent px-4 outline-none hover:bg-[var(--state-hover)] data-[state=open]:bg-[var(--state-hover)]">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border border-[color:var(--border-default)] bg-[var(--surface-overlay)]">
                            <LogoInverted className="h-5 w-5 text-text-default" />
                        </div>
                        <div className="flex flex-col items-start">
                            <span className="text-[12px] leading-none tracking-tight text-text-muted">Environment</span>
                            <span className="mt-0.5 text-[13px] font-medium leading-none text-text-default">{env}</span>
                        </div>
                    </div>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 text-text-default" />
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
                                        <div className="flex flex-row items-center gap-2">
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
        </>
    );
};
