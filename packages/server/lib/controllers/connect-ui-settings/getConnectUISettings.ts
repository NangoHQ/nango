import { connectUISettingsService } from '@nangohq/shared';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import type { GetConnectUISettings } from '@nangohq/types/lib/connect-ui-settings/api.js';

export const getConnectUISettings = asyncWrapper<GetConnectUISettings>(async (_, res) => {
    const { environment, plan } = res.locals;
    let dbConnectUISettings = await connectUISettingsService.getConnectUISettings(environment.id);

    if (!dbConnectUISettings) {
        // Create default connect UI settings
        dbConnectUISettings = await connectUISettingsService.upsertConnectUISettings(environment.id, {});
    }

    const connectUISettingsDto = dbConnectUISettings
        ? {
              nangoWatermark: dbConnectUISettings.nango_watermark,
              colors: {
                  primary: dbConnectUISettings.color_primary,
                  onPrimary: dbConnectUISettings.color_on_primary,
                  background: dbConnectUISettings.color_background,
                  surface: dbConnectUISettings.color_surface,
                  text: dbConnectUISettings.color_text,
                  textMuted: dbConnectUISettings.color_text_muted
              }
          }
        : null;

    // If the plan gets disabled, we need to re-enable the watermark
    if (connectUISettingsDto && !plan?.connectui_disable_watermark) {
        connectUISettingsDto.nangoWatermark = true;
        await connectUISettingsService.upsertConnectUISettings(environment.id, connectUISettingsDto);
    }

    // If the plan gets disabled, we need to reset the colors
    if (connectUISettingsDto && !plan?.connectui_colors_customization) {
        connectUISettingsDto.colors = {
            primary: undefined,
            onPrimary: undefined,
            background: undefined,
            surface: undefined,
            text: undefined,
            textMuted: undefined
        };
        await connectUISettingsService.upsertConnectUISettings(environment.id, connectUISettingsDto);
    }

    res.status(200).send({
        data: connectUISettingsDto
    });
});
