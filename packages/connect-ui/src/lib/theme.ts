import type { ConnectUIThemeSettings } from '@nangohq/types';

export function setTheme(theme: ConnectUIThemeSettings) {
    const root = document.documentElement;

    const primary = theme.light.primary;
    if (!primary) {
        return;
    }

    root.style.setProperty('--color-primary', primary);

    const brandHex = cssColorToHex(primary);
    root.style.setProperty('--color-on-primary', hexColorIsDark(brandHex) ? '#ffffff' : '#000000');
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
