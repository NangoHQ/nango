import { getProviders } from '@nangohq/shared';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

let providersJSON: string | undefined = undefined;

export const getProvidersJSON = asyncWrapper<any, any>((_, res) => {
    if (!providersJSON) {
        providersJSON = JSON.stringify(getProviders());
    }

    res.setHeader('content-type', 'application/json');
    res.send(providersJSON);
});
