export interface ConnectUISettings {
    theme: ConnectUIThemeSettings;
    defaultTheme: Theme;
    showWatermark: boolean;
}

export interface ConnectUIThemeSettings {
    light: ConnectUIColorPalette;
    dark: ConnectUIColorPalette;
}

export interface ConnectUIColorPalette {
    primary: string;
}

export type Theme = 'light' | 'dark' | 'system';
