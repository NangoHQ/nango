import { findCatalogFunctions, remoteFileService } from '@nangohq/shared';
import { report } from '@nangohq/utils';

import type { RequestLocals } from '../../../../utils/express.js';
import type { GetPublicProviderTemplateCode, ScriptTypeLiteral } from '@nangohq/types';
import type { Response } from 'express';

export async function handleGetProviderTemplateCode({
    res,
    provider,
    name,
    type
}: {
    res: Response<GetPublicProviderTemplateCode['Reply'], RequestLocals>;
    provider: string;
    name: string;
    type: ScriptTypeLiteral | undefined;
}): Promise<void> {
    const matches = findCatalogFunctions({ provider, name, type });

    if (matches.length > 1) {
        res.status(409).send({
            error: {
                code: 'ambiguous_function',
                message: `Multiple catalog functions named '${name}' found for '${provider}'. Specify a type to disambiguate.`,
                payload: { matches: matches.map((match) => ({ type: match.type, name: match.name })) }
            }
        });
        return;
    }

    const match = matches[0];
    if (!match) {
        res.status(404).send({ error: { code: 'unknown_function', message: `Function '${name}' not found in the catalog for '${provider}'` } });
        return;
    }

    try {
        const code = await remoteFileService.getFile(match.sourceLocation);
        res.status(200).send({ type: match.type, code });
    } catch (err) {
        report(err, { provider, scriptName: name, scriptType: match.type });
        res.status(404).send({
            error: { code: 'source_unavailable', message: `Function '${name}' is listed in the catalog but its source could not be loaded` }
        });
    }
}
