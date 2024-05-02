import type { NangoAction, LeverOpportunityNote, LeverCreateNoteInput } from '../../models';

export default async function runAction(nango: NangoAction, input: LeverCreateNoteInput): Promise<LeverOpportunityNote> {
    if (!input.opportunityId) {
        throw new nango.ActionError({
            message: 'opportunity id is a required field'
        });
    } else if (!input.value) {
        throw new nango.ActionError({
            message: 'value of the note is a required field'
        });
    }

    const endpoint = `/v1/opportunities/${input.opportunityId}/notes`;

    try {
        const postData = {
            value: input.value,
            secret: input.secret,
            score: input.score,
            notifyFollowers: input.notifyFollowers,
            createdAt: input.createdAt
        };

        const params = Object.entries({
            ...(input.perform_as ? { perform_as: input.perform_as } : {}),
            ...(input.note_id ? { note_id: input.note_id } : {})
        })
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');

        const urlWithParams = `${endpoint}${params ? `?${params}` : ''}`;

        const resp = await nango.post({
            endpoint: urlWithParams,
            data: postData
        });

        return {
            id: resp.data.data.id,
            text: resp.data.data.text,
            fields: resp.data.data.fields,
            user: resp.data.data.user,
            secret: resp.data.data.secret,
            completedAt: resp.data.data.completedAt,
            createdAt: resp.data.data.createdAt,
            deletedAt: resp.data.data.deletedAt
        };
    } catch (error: any) {
        throw new nango.ActionError({
            message: `Error in runAction: ${error.message}`
        });
    }
}
