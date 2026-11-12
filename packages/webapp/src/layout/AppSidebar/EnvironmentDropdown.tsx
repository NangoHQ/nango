import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { ArrowUpRight, Check, ChevronsUpDown, Plus, TriangleAlert } from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Alert, AlertActions, AlertDescription, Button, EnvPill } from '@nangohq/design-system';

import { LogoInverted } from '@/assets/LogoInverted';
import { PermissionGate } from '@/components/patterns/PermissionGate.js';
import { AlertButtonLink } from '@/components/ui/AlertButtonLink';
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu.js';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions.js';
import { useCurrentPlan } from '@/hooks/usePlan';
import { isLegacyPlan } from '@/pages/Team/Billing/planVisibility';
import { useStore } from '@/store';
import { envSwitchPath } from '@/utils/routes';
import { cn } from '@/utils/utils';
import { CreateEnvironmentDialog } from './CreateEnvironmentDialog.js';
import { navigationMenuContentClassName, navigationMenuSeparatorClassName } from './navigationMenu.js';

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
    const isProduction = Boolean(meta?.environments.find((environment) => environment.name === env)?.is_production);

    const onSelect = (selected: string) => {
        if (selected === env) {
            return;
        }

        // Non-environment-specific pages — just update env in store, don't change URL
        const newPath = envSwitchPath(window.location.pathname, selected);
        if (!newPath) {
            setEnv(selected);
            return;
        }

        void navigate(newPath);
    };

    if (!meta) {
        return;
    }

    return (
        <>
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger
                    className={cn(
                        'group/env flex w-full cursor-pointer items-center justify-between gap-2 rounded-ds-sm border-ds-hairline border-border-default bg-surface-canvas p-2 outline-none transition-colors focus-inset',
                        'hover:bg-surface-raised active:border-border-strong active:bg-surface-raised data-[state=open]:border-border-strong data-[state=open]:bg-surface-raised'
                    )}
                >
                    <span className="flex min-w-0 items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-ds-xs border-ds-hairline border-border-default bg-surface-overlay">
                            <LogoInverted className="size-5 text-text-strong" />
                        </span>
                        <span className="type-text-medium-sm truncate text-text-default">{env}</span>
                        {isProduction && <EnvPill env="Prod" production />}
                    </span>
                    <ChevronsUpDown className="size-4 shrink-0 text-icon-secondary group-hover/env:text-icon-default group-data-[state=open]/env:text-icon-default" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="bottom" sideOffset={4} className={cn(navigationMenuContentClassName, 'max-h-96 w-61')}>
                    <DropdownMenuPrimitive.Label className="type-label-xs px-2 pt-1.5 pb-1 uppercase text-text-muted">Environments</DropdownMenuPrimitive.Label>
                    <DropdownMenuPrimitive.RadioGroup value={env} onValueChange={onSelect}>
                        {meta.environments.map((environment) => (
                            <PermissionGate
                                key={environment.name}
                                condition={can('environment:settings:read', environment)}
                                message="Your role does not have access to this environment."
                                tooltipSide="right"
                            >
                                {(allowed) => (
                                    <DropdownMenuPrimitive.RadioItem
                                        value={environment.name}
                                        disabled={!allowed}
                                        className={cn(
                                            'flex w-full cursor-pointer items-center gap-2 rounded-ds-xs px-2 py-1 text-text-strong outline-hidden select-none transition-colors',
                                            'focus:not-data-[state=checked]:bg-state-hover data-[state=checked]:bg-state-selected focus:data-[state=checked]:bg-state-selected-hover',
                                            'data-[disabled]:pointer-events-none data-[disabled]:text-text-disabled'
                                        )}
                                    >
                                        <span className="flex min-w-0 items-center gap-1.5">
                                            <span className="type-code-regular-sm truncate">{environment.name}</span>
                                            {environment.is_production && <EnvPill env="Prod" production />}
                                        </span>
                                        <DropdownMenuPrimitive.ItemIndicator className="ml-auto flex">
                                            <Check className="size-3.5 text-icon-default" />
                                        </DropdownMenuPrimitive.ItemIndicator>
                                    </DropdownMenuPrimitive.RadioItem>
                                )}
                            </PermissionGate>
                        ))}
                    </DropdownMenuPrimitive.RadioGroup>
                    <DropdownMenuSeparator className={navigationMenuSeparatorClassName} />
                    <div className="flex flex-col gap-2 px-1 pt-2 pb-1">
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
                                        <Plus />
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
        </>
    );
};
