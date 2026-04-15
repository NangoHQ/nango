import { BookOpen, Box } from 'lucide-react';

import { permissions } from '@nangohq/authz';

import { Breadcrumbs } from './Breadcrumbs';
import { PermissionGate } from './PermissionGate';
import { Button, ButtonLink } from './ui/button';
import { SlackIcon } from '@/assets/SlackIcon';
import { useEnvironment } from '@/hooks/useEnvironment';
import { usePermissions } from '@/hooks/usePermissions';
import { useStore } from '@/store';
import { usePlaygroundStore } from '@/store/playground';
import { cn } from '@/utils/utils';

export const AppHeader: React.FC = () => {
    const env = useStore((s) => s.env);
    const playgroundOpen = usePlaygroundStore((s) => s.isOpen);
    const setPlaygroundOpen = usePlaygroundStore((s) => s.setOpen);
    const { data: envData } = useEnvironment(env);
    const environment = envData?.environmentAndAccount?.environment;
    const { can } = usePermissions();
    const canUsePlayground = envData != null && (can(permissions.canUseProdPlayground) || !environment?.is_production);

    return (
        <header className="h-16 px-10 pl-2 py-2.5 items-center flex justify-between shrink-0 gap-1.5">
            <Breadcrumbs />
            <div className="flex gap-1.5 justify-end">
                <PermissionGate condition={canUsePlayground}>
                    {(allowed) => (
                        <div className="relative">
                            <div className="pointer-events-none absolute -top-[-2px] -left-[2px] -z-10 h-[19px] w-[25px] rounded-full blur-[6px] [background:linear-gradient(263deg,var(--color-brand-500)_8.44%,var(--color-brand-700)_100%)]" />
                            <Button
                                variant="secondary"
                                size="sm"
                                disabled={!allowed}
                                onClick={() => setPlaygroundOpen(!playgroundOpen)}
                                className={cn(
                                    'relative z-10 overflow-visible rounded-sm [border:0.5px_solid_transparent] text-btn-tertiary-fg hover:[background:linear-gradient(var(--color-bg-surface),var(--color-bg-surface))_padding-box,linear-gradient(90deg,var(--color-brand-500)_0%,var(--color-brand-500)_100%)_border-box] active:[background:linear-gradient(var(--color-bg-surface),var(--color-bg-surface))_padding-box,linear-gradient(90deg,var(--color-brand-500)_0%,var(--color-brand-500)_100%)_border-box] focus:[background:linear-gradient(var(--color-bg-surface),var(--color-bg-surface))_padding-box,linear-gradient(90deg,var(--color-brand-500)_0%,var(--color-brand-500)_100%)_border-box] disabled:bg-btn-tertiary-disabled data-loading:bg-btn-tertiary-loading data-loading:opacity-100',
                                    playgroundOpen
                                        ? '[background:linear-gradient(var(--color-bg-surface),var(--color-bg-surface))_padding-box,linear-gradient(90deg,var(--color-brand-500)_0%,var(--color-brand-500)_100%)_border-box]'
                                        : '[background:linear-gradient(var(--color-bg-surface),var(--color-bg-surface))_padding-box,linear-gradient(90deg,var(--color-brand-500)_0%,var(--color-border-default)_100%)_border-box]'
                                )}
                            >
                                <Box />
                                Playground
                            </Button>
                        </div>
                    )}
                </PermissionGate>
                <ButtonLink to="https://nango.dev/docs" target="_blank" variant="secondary" size="sm">
                    <BookOpen />
                    Docs
                </ButtonLink>
                <ButtonLink to="https://nango.dev/slack" target="_blank" variant="secondary" size="sm">
                    <SlackIcon />
                    Help
                </ButtonLink>
            </div>
        </header>
    );
};
