import { NangoError, deserializeNangoError } from '@nangohq/shared';
import { stringifyError } from '@nangohq/utils';

export function getFormattedScriptError({ err, defaultErrorType, scriptName }: { err: unknown; defaultErrorType: string; scriptName: string }) {
    if (typeof err !== 'object') {
        return new NangoError('invalid_error', err);
    }
    if (!err) {
        return new NangoError('invalid_error', null as any);
    }

    const tmp = deserializeNangoError(err);
    if (tmp) {
        return tmp;
    }

    if ('response' in err && 'data' in (err.response as any)) {
        const res = err.response as { data: any };
        return new NangoError(defaultErrorType, res.data);
    }

    if ('message' in err) {
        return new NangoError(defaultErrorType, stringifyError(err));
    }

    return new NangoError(defaultErrorType, `Script for '${scriptName}' failed to execute with unknown error, ${JSON.stringify(err)}`);
}
