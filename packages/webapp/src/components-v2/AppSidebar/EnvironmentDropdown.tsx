import { Check, ChevronsUpDown, Lock } from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { StyledLink } from '../StyledLink.js';
import { CreateEnvironmentDialog } from './CreateEnvironmentDialog.js';
import { Button } from '../ui/button.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.js';
import { SidebarMenu, SidebarMenuItem } from '../ui/sidebar.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.js';
import { LogoInverted } from '@/assets/LogoInverted';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useMeta } from '@/hooks/useMeta';
import { useStore } from '@/store';

export const EnvironmentDropdown: React.FC = () => {
    const env = useStore((state) => state.env);
    const setEnv = useStore((state) => state.setEnv);
    const envs = useStore((state) => state.envs);
    const environment = useEnvironment(env);
    const { meta } = useMeta();
    const [environmentDialogOpen, setEnvironmentDialogOpen] = useState(false);

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
                                <span className="text-s leading-3 text-text-secondary">Environment</span>
                                <span className="text-sm leading-4 text-text-primary font-semibold capitalize truncate max-w-28">{env}</span>
                            </div>
                        </div>
                        <ChevronsUpDown className="w-4.5 h-4.5 text-text-primary" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="bottom" className="w-50 flex flex-col gap-2">
                        {meta?.environments.map((environment) => (
                            <DropdownMenuItem
                                key={environment.name}
                                onSelect={() => onSelect(environment.name)}
                                data-active={env === environment.name}
                                className="flex flex-row items-center gap-2 cursor-pointer data-[active=true]:text-text-primary"
                            >
                                <Check
                                    className="w-5 h-5 opacity-0 data-[active=true]:opacity-100 data-[active=true]:text-text-primary"
                                    data-active={env === environment.name}
                                />
                                <span className="capitalize">{environment.name}</span>
                            </DropdownMenuItem>
                        ))}
                        <Tooltip delayDuration={0}>
                            <TooltipTrigger asChild>
                                <span tabIndex={0} className="w-full">
                                    <Button
                                        variant="primary"
                                        onClick={() => {
                                            // Managed control because Dialogs within DropdownMenus behave weirdly
                                            setEnvironmentDialogOpen(true);
                                        }}
                                        disabled={!!isMaxEnvironmentsReached}
                                        className="w-full"
                                    >
                                        {!!isMaxEnvironmentsReached && <Lock className="size-4" />}
                                        Create Environment
                                    </Button>
                                </span>
                            </TooltipTrigger>
                            {isMaxEnvironmentsReached && (
                                <TooltipContent side="right" align="center">
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
                                </TooltipContent>
                            )}
                        </Tooltip>
                    </DropdownMenuContent>
                </DropdownMenu>
                <CreateEnvironmentDialog open={environmentDialogOpen} onOpenChange={setEnvironmentDialogOpen} />
            </SidebarMenuItem>
        </SidebarMenu>
    );
};
