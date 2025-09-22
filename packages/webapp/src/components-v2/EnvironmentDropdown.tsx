import { Check, ChevronsUpDown } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { SidebarMenu, SidebarMenuItem } from './ui/sidebar';
import { LogoInverted } from '@/assets/logo-inverted';
import { useMeta } from '@/hooks/useMeta';
import { useStore } from '@/store';

export const EnvironmentDropdown: React.FC = () => {
    const env = useStore((state) => state.env);
    const setEnv = useStore((state) => state.setEnv);
    const { meta } = useMeta();

    const navigate = useNavigate();

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
                <DropdownMenu>
                    <DropdownMenuTrigger className="h-fit w-full rounded p-2.5 flex flex-row items-center justify-between cursor-pointer bg-dropdown-bg-default hover:bg-dropdown-bg-press border border-border-muted hover:border-0 hover:my-px hover:border-l data-[state=open]:bg-dropdown-bg-press data-[state=open]:border ">
                        <div className="flex gap-2 items-center">
                            <LogoInverted className="h-6 w-6 text-text-primary" />
                            <div className="flex flex-col items-start">
                                <span className="text-s text-text-secondary">Environment</span>
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
                                className="flex flex-row items-center gap-2 data-[active=true]:text-text-primary"
                            >
                                <Check
                                    className="w-5 h-5 opacity-0 data-[active=true]:opacity-100 data-[active=true]:text-text-primary"
                                    data-active={env === environment.name}
                                />
                                <span className="capitalize">{environment.name}</span>
                            </DropdownMenuItem>
                        ))}
                        <Button variant="primary">Create Environment</Button>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
};
