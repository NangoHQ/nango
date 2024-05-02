import type { NangoAction, LeverOpportunity, LeverCreateOpportunityInput } from '../../models';

export default async function runAction(nango: NangoAction, input: LeverCreateOpportunityInput): Promise<LeverOpportunity> {
    if (!input.perform_as) {
        throw new nango.ActionError({
            message: 'perform_as is the only required field'
        });
    }

    const endpoint = `/v1/opportunities?perform_as=${input.perform_as}`;

    try {
        const postData = {
            name: input.name,
            headline: input.headline,
            stage: input.stage,
            location: input.location,
            phones: input.phones,
            emails: input.emails,
            links: input.links,
            tags: input.tags,
            sources: input.sources,
            origin: input.origin,
            owner: input.owner,
            followers: input.followers,
            postings: input.postings,
            createdAt: input.createdAt,
            archived: input.archived,
            contact: input.contact
        };

        const queryParams = Object.entries({
            ...(input.parse ? { parse: input.parse } : {}),
            ...(input.perform_as_posting_owner ? { note_id: input.perform_as_posting_owner } : {})
        })
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');

        const params = queryParams ? `&${queryParams}` : '';
        const urlWithParams = `${endpoint}${params}`;

        const resp = await nango.post({
            endpoint: urlWithParams,
            data: postData
        });

        return {
            id: resp.data.data.id,
            name: resp.data.data.name,
            headline: resp.data.data.headline,
            contact: resp.data.data.contact,
            emails: resp.data.data.emails,
            phones: resp.data.data.phones,
            confidentiality: resp.data.data.confidentiality,
            location: resp.data.data.location,
            links: resp.data.data.links,
            archived: resp.data.data.archived,
            createdAt: resp.data.data.createdAt,
            updatedAt: resp.data.data.updatedAt,
            lastInteractionAt: resp.data.data.lastInteractionAt,
            lastAdvancedAt: resp.data.data.lastAdvancedAt,
            snoozedUntil: resp.data.data.snoozedUntil,
            archivedAt: resp.data.data.archivedAt,
            archiveReason: resp.data.data.archiveReason,
            stage: resp.data.data.stage,
            stageChanges: resp.data.data.stageChanges,
            owner: resp.data.data.owner,
            tags: resp.data.data.tags,
            sources: resp.data.data.sources,
            origin: resp.data.data.origin,
            sourcedBy: resp.data.data.sourcedBy,
            applications: resp.data.data.applications,
            resume: resp.data.data.resume,
            followers: resp.data.data.followers,
            urls: resp.data.data.urls,
            dataProtection: resp.data.data.dataProtection,
            isAnonymized: resp.data.data.isAnonymized,
            opportunityLocation: resp.data.data.opportunityLocation
        };
    } catch (error: any) {
        throw new nango.ActionError({
            message: `Error in runAction: ${error.message}`
        });
    }
}
