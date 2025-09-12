export interface ConnectUISettings {
    theme: ConnectUIThemeSettings;
    showWatermark: boolean;
}

export interface ConnectUIThemeSettings {
    light: ConnectUIColorPalette;
    dark: ConnectUIColorPalette;
}

export interface ConnectUIColorPalette {
    primary: string;
}
