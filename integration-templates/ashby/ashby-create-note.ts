import type { NangoAction, AshbyCreateNoteResponse } from './models';

interface AshbyCreateNoteInput {
    candidateId: string;
    note: string | NoteObject;
    sendNotifications?: boolean;
}

interface NoteObject {
    value: string;
    type: string;
}

export default async function runAction(nango: NangoAction, input: AshbyCreateNoteInput): Promise<AshbyCreateNoteResponse> {
    if (!input.candidateId) {
        throw new nango.ActionError({
            message: 'candidateId is a required field'
        });
    } else if (typeof input.note === 'object') {
        const noteObject = input.note as NoteObject;
        if (!noteObject.value || !noteObject.type) {
            throw new nango.ActionError({
                message: 'When note is an object, it must have "value" and "type" properties, both of which are required'
            });
        }
    } else if (!input.note) {
        throw new nango.ActionError({
            message: 'note is a required field'
        });
    }

    try {
        const postData = {
            candidateId: input.candidateId,
            sendNotifications: input.sendNotifications,
            note: input.note
        };

        const resp = await nango.post({
            endpoint: `/candidate.createNote`,
            data: postData
        });

        const { id, createdAt, content, author } = resp.data.results;

        return { id, createdAt, content, author };
    } catch (error: any) {
        throw new Error(`Error in runAction: ${error.message}`);
    }
}
