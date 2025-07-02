export interface GetConnectUISettingsResponse {
    nangoWatermark: boolean;
    colors?:
        | {
              primary?: string | undefined;
              onPrimary?: string | undefined;
              background?: string | undefined;
              surface?: string | undefined;
              text?: string | undefined;
              textMuted?: string | undefined;
          }
        | undefined;
}

export interface CreateConnectUISettingsInput {
    nangoWatermark?: boolean | undefined;
    colors?:
        | {
              primary?: string | undefined | null;
              onPrimary?: string | undefined | null;
              background?: string | undefined | null;
              surface?: string | undefined | null;
              text?: string | undefined | null;
              textMuted?: string | undefined | null;
          }
        | undefined;
}
