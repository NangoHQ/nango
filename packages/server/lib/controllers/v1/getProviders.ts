import { getRawProviders } from '@nangohq/shared';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

export const getProviders = asyncWrapper<any, any>((_, res) => {
    const rawProviders = getRawProviders();

    res.setHeader('content-type', 'application/yaml');
    res.send(rawProviders);
});
