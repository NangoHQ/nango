import { BookOpen, Box, LifeBuoy, SunMedium } from 'lucide-react';

import { permissions } from '@nangohq/authz';

import { Breadcrumbs } from './Breadcrumbs';
import { PermissionGate } from './PermissionGate';
import { useEnvironment } from '@/hooks/useEnvironment';
import { usePermissions } from '@/hooks/usePermissions';
import { useStore } from '@/store';
import { usePlaygroundStore } from '@/store/playground';

const headerButtonClass =
    'inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[2px] border-[0.5px] border-[color:var(--border-default)] bg-[var(--interactive-outline)] px-2.5 text-[13px] font-medium leading-none text-text-default transition-colors hover:bg-[var(--state-hover)] disabled:cursor-not-allowed disabled:opacity-50';

const headerIconButtonClass =
    'inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-[2px] border-[0.5px] border-[color:var(--border-default)] bg-[var(--interactive-outline)] text-text-default transition-colors hover:bg-[var(--state-hover)] disabled:cursor-not-allowed disabled:opacity-50';

export const AppHeader: React.FC = () => {
    const env = useStore((s) => s.env);
    const playgroundOpen = usePlaygroundStore((s) => s.isOpen);
    const setPlaygroundOpen = usePlaygroundStore((s) => s.setOpen);
    const { data: envData } = useEnvironment(env);
    const environment = envData?.environmentAndAccount?.environment;
    const { can } = usePermissions();
    const canUsePlayground = envData != null && (can(permissions.canUseProdPlayground) || !environment?.is_production);

    return (
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[color:var(--border-default)] bg-surface-canvas px-6">
            <Breadcrumbs />
            <div className="flex items-center gap-1.5">
                <PermissionGate condition={canUsePlayground}>
                    {(allowed) => (
                        <button
                            className={headerButtonClass}
                            disabled={!allowed}
                            onClick={() => setPlaygroundOpen(!playgroundOpen)}
                            aria-pressed={playgroundOpen}
                        >
                            <Box size={16} />
                            Playground
                        </button>
                    )}
                </PermissionGate>
                <a href="https://nango.dev/docs" target="_blank" rel="noreferrer" className={headerIconButtonClass} aria-label="Documentation">
                    <BookOpen size={16} />
                </a>
                <a href="https://nango.dev/slack" target="_blank" rel="noreferrer" className={headerIconButtonClass} aria-label="Help">
                    <LifeBuoy size={16} />
                </a>
                {/* TODO: wire up runtime theme switching — NAN-XXXX */}
                <button className={headerIconButtonClass} aria-label="Toggle theme" disabled>
                    <SunMedium size={16} />
                </button>
            </div>
        </header>
    );
};
