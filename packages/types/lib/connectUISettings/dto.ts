export interface ConnectUISettings {
    theme: ConnectUIThemeSettings;
    showWatermark: boolean;
}

export interface ConnectUIThemeSettings {
    light: ConnectUIColorPalette;
    dark: ConnectUIColorPalette;
}

export interface ConnectUIColorPalette {
    background: string;
    foreground: string;
    primary: string;
    primaryForeground: string;
    textPrimary: string;
    textMuted: string;
}
