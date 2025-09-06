export interface ConnectUISettings {
    theme: ConnectUIThemeSettings;
    showWatermark: boolean;
}

export interface ConnectUIThemeSettings {
    light: ConnectUIColorPalette;
    dark: ConnectUIColorPalette;
}

export interface ConnectUIColorPalette {
    backgroundSurface: string;
    backgroundElevated: string;
    primary: string;
    onPrimary: string;
    textPrimary: string;
    textSecondary: string;
}
