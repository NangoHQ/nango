import { useEffect, useLayoutEffect, useState } from 'react';

import { useGlobal } from './store';

import type { ConnectUIThemeSettings, Theme } from '@nangohq/types';

export function isValidTheme(theme: string): theme is Theme {
    return ['light', 'dark', 'system'].includes(theme);
}

/**
 * Applies the theme and returns it, `null` until the connect session delivers the settings.
 * Resolving that `null` to a default makes the UI paint in one theme and then switch to another.
 */
export function useAppliedTheme(): 'light' | 'dark' | null {
    const theme = useGlobal((state) => state.theme);
    const settings = useGlobal((state) => state.settings);
    const systemTheme = useSystemTheme();

    const appliedTheme = theme === null ? null : theme === 'system' ? systemTheme : theme;

    // Before paint, so the first frame of a themed view is never the wrong theme.
    useLayoutEffect(() => {
        if (!appliedTheme) {
            return;
        }
        document.documentElement.classList.toggle('dark', appliedTheme === 'dark');
        if (settings) {
            setColors(settings.theme, appliedTheme);
        }
    }, [appliedTheme, settings]);

    return appliedTheme;
}

function useSystemTheme(): 'light' | 'dark' {
    const [systemTheme, setSystemTheme] = useState(getSystemTheme);

    useEffect(() => {
        const query = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? 'dark' : 'light');
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
    }, []);

    return systemTheme;
}

function getSystemTheme(): 'light' | 'dark' {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setColors(theme: ConnectUIThemeSettings, appliedTheme: 'light' | 'dark'): void {
    const root = document.documentElement;
    const primary = theme[appliedTheme].primary;

    if (primary) {
        root.style.setProperty('--color-primary', primary);
        root.style.setProperty('--color-on-primary', hexColorIsDark(cssColorToHex(primary)) ? '#ffffff' : '#000000');
    }
}

/**
 * Converts any CSS color (hex, rgb, hsl, named colors, etc.) to hex format
 * @param cssColor - Any valid CSS color string
 * @returns Hex color string (e.g., "red" -> "#ff0000")
 */
function cssColorToHex(cssColor: string): string {
    if (cssColor.startsWith('#')) {
        return cssColor;
    }

    // Create a temporary element to leverage browser's color parsing
    const tempElement = document.createElement('div');
    tempElement.style.color = cssColor;
    document.body.appendChild(tempElement);

    // Get the computed color value
    const computedColor = window.getComputedStyle(tempElement).color;

    // Clean up
    document.body.removeChild(tempElement);

    // Convert rgb(r,g,b) to hex
    const rgbMatch = computedColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
        const r = parseInt(rgbMatch[1], 10);
        const g = parseInt(rgbMatch[2], 10);
        const b = parseInt(rgbMatch[3], 10);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    // Fallback: return the original color if parsing fails
    return cssColor;
}

// From: https://stackoverflow.com/a/41491220

function hexColorIsDark(bgColor: string) {
    const color = bgColor.charAt(0) === '#' ? bgColor.substring(1, 7) : bgColor;
    const r = parseInt(color.substring(0, 2), 16); // hexToR
    const g = parseInt(color.substring(2, 4), 16); // hexToG
    const b = parseInt(color.substring(4, 6), 16); // hexToB
    return r * 0.299 + g * 0.587 + b * 0.114 <= 186;
}
