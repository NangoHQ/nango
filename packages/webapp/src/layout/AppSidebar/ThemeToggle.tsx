import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Monitor, Moon, SunMedium } from 'lucide-react';

import { DropdownMenuRadioGroup } from '@/components/ui/DropdownMenu';
import { useThemeStore } from '@/lib/theme';
import { cn } from '@/utils/utils';

import type { Theme } from '@/lib/theme';
import type { LucideIcon } from 'lucide-react';

const options: { value: Theme; label: string; Icon: LucideIcon }[] = [
    { value: 'light', label: 'Light', Icon: SunMedium },
    { value: 'dark', label: 'Dark', Icon: Moon },
    { value: 'system', label: 'System', Icon: Monitor }
];

/**
 * Figma "ThemeToggle". Renders as menu radio items, so it must live inside a DropdownMenu. Uses the
 * Radix radio item directly: `DropdownMenuRadioItem` is a full-width list row.
 */
export const ThemeToggle: React.FC = () => {
    const theme = useThemeStore((s) => s.theme);
    const setTheme = useThemeStore((s) => s.setTheme);

    return (
        <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value) => setTheme(value as Theme)}
            aria-label="Theme"
            className="flex shrink-0 gap-0.5 rounded-ds-sm border-ds-hairline border-border-default bg-surface-canvas p-0.5"
        >
            {options.map(({ value, label, Icon }) => (
                <DropdownMenuPrimitive.RadioItem
                    key={value}
                    value={value}
                    aria-label={label}
                    title={label}
                    // Keep the menu open so the new theme can be seen in place.
                    onSelect={(event) => event.preventDefault()}
                    className={cn(
                        'flex h-5.5 w-6.5 cursor-pointer items-center justify-center rounded-ds-xs text-icon-secondary outline-none transition-colors',
                        'focus:text-icon-default focus:not-data-[state=checked]:bg-state-hover data-[state=checked]:bg-state-selected focus:data-[state=checked]:bg-state-selected-hover data-[state=checked]:text-icon-default'
                    )}
                >
                    <Icon className="size-3.5" />
                </DropdownMenuPrimitive.RadioItem>
            ))}
        </DropdownMenuRadioGroup>
    );
};
