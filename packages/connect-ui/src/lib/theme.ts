export interface ThemeColors {
    primary: string;
}

export function updateTheme(colors: ThemeColors) {
    const root = document.documentElement;

    Object.entries(colors).forEach(([key, value]) => {
        if (value) {
            const cssVarName = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
            root.style.setProperty(cssVarName, value);
        }
    });
}
