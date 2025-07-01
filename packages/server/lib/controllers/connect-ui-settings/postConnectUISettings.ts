import type { PostConnectUISettings } from '@nangohq/types/lib/connect-ui-settings/api.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { connectUISettingsService } from '@nangohq/shared';

export const postConnectUISettings = asyncWrapper<PostConnectUISettings>(async (req, res) => {
    const { environment, plan } = res.locals;
    const input: PostConnectUISettings['Body'] = req.body;

    if (!plan?.connectui_disable_watermark) {
        input.nangoWatermark = true;
    }

    if (!plan?.connectui_colors_customization) {
        input.colors = undefined;
    }

    await connectUISettingsService.upsertConnectUISettings(environment.id, input);

    res.status(200).send({ success: true });
});
