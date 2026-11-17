import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Monitor, Moon, SunMedium } from 'lucide-react';

import { SegmentedControl, SegmentedControlItem } from '@nangohq/design-system';

import { useThemeStore } from '@/lib/theme';

import type { Theme } from '@/lib/theme';
import type { LucideIcon } from 'lucide-react';

const options: { value: Theme; label: string; Icon: LucideIcon }[] = [
    { value: 'light', label: 'Light theme', Icon: SunMedium },
    { value: 'dark', label: 'Dark theme', Icon: Moon },
    { value: 'system', label: 'System theme', Icon: Monitor }
];

const MENU_ROWS = '[data-radix-collection-item]:not([data-slot="segmented-control-item"]):not([data-disabled])';

/**
 * Profile menu theme switcher (Figma 2509:1948): a small icon-only Segmented Control. Must live inside a
 * DropdownMenu. It registers as one menu row, so the menu's Up/Down reach it: entering it focuses the
 * selected theme, Left/Right change the theme (the menu stays open), and Up/Down move on to the next row.
 */
export const ThemeSwitcher: React.FC = () => {
    const theme = useThemeStore((s) => s.theme);
    const setTheme = useThemeStore((s) => s.setTheme);

    return (
        <DropdownMenuPrimitive.Item asChild onSelect={(event) => event.preventDefault()}>
            <div
                // The radios inside carry the semantics; the menu row is only a keyboard stop.
                role="none"
                className="shrink-0 rounded-ds-sm outline-none"
                // Stops Radix focusing the row on each mouse move, which steals focus from the radios and flickers their tooltip.
                onPointerMove={(event) => {
                    event.preventDefault();
                    if (!event.currentTarget.contains(document.activeElement)) {
                        event.currentTarget.closest<HTMLElement>('[role="menu"]')?.focus({ preventScroll: true });
                    }
                }}
                onFocus={(event) => {
                    // Only hand focus to the selected item from the keyboard, or a click on the track would open its tooltip.
                    if (event.target === event.currentTarget && event.currentTarget.matches(':focus-visible')) {
                        event.currentTarget.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
                    }
                }}
                onKeyDown={(event) => {
                    if (event.target === event.currentTarget) {
                        return;
                    }
                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                        const menu = event.currentTarget.closest('[role="menu"]');
                        const rows = Array.from(menu?.querySelectorAll<HTMLElement>(MENU_ROWS) ?? []);
                        const index = rows.indexOf(event.currentTarget);
                        const next = rows[(index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length];
                        event.preventDefault();
                        next?.focus();
                    }
                }}
            >
                <SegmentedControl
                    // A menu may only own groups and menu items, so the radios are announced as menu radios here
                    role="group"
                    size="sm"
                    orientation="horizontal"
                    aria-label="Theme"
                    value={theme}
                    onValueChange={(value) => setTheme(value as Theme)}
                    onKeyDown={(event) => {
                        // Enter/Space belong to the focused radio. The menu row would otherwise swallow them.
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.stopPropagation();
                        }
                    }}
                >
                    {options.map(({ value, label, Icon }) => (
                        <SegmentedControlItem key={value} role="menuitemradio" value={value} aria-label={label} icon={<Icon />} />
                    ))}
                </SegmentedControl>
            </div>
        </DropdownMenuPrimitive.Item>
    );
};
