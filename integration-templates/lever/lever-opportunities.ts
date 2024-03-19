import type { LeverOpportunity, NangoSync } from './models';

const LIMIT = 100;

export default async function fetchData(nango: NangoSync) {
    let totalRecords = 0;

    try {
        const endpoint = '/v1/opportunities';
        const config = {
            ...(nango.lastSyncDate ? { params: { created_at_start: nango.lastSyncDate.getTime() } } : {}),
            paginate: {
                type: 'cursor',
                cursor_path_in_response: 'next',
                cursor_name_in_request: 'offset',
                limit_name_in_request: 'limit',
                response_path: 'data',
                limit: LIMIT
            }
        };
        for await (const opportunity of nango.paginate({ ...config, endpoint })) {
            const mappedOpportunity: LeverOpportunity[] = opportunity.map(mapOpportunity) || [];

            const batchSize: number = mappedOpportunity.length;
            totalRecords += batchSize;
            await nango.log(`Saving batch of ${batchSize} opportunities (total opportunities: ${totalRecords})`);
            await nango.batchSave(mappedOpportunity, 'LeverOpportunity');
        }
    } catch (error: any) {
        throw new Error(`Error in fetchData: ${error.message}`);
    }
}

function mapOpportunity(opportunity: any): LeverOpportunity {
    return {
        id: opportunity.id,
        name: opportunity.name,
        headline: opportunity.headline,
        contact: opportunity.contact,
        emails: opportunity.emails,
        phones: opportunity.phones,
        confidentiality: opportunity.confidentiality,
        location: opportunity.location,
        links: opportunity.links,
        archived: opportunity.archived,
        createdAt: opportunity.createdAt,
        updatedAt: opportunity.updatedAt,
        lastInteractionAt: opportunity.lastInteractionAt,
        lastAdvancedAt: opportunity.lastAdvancedAt,
        snoozedUntil: opportunity.snoozedUntil,
        archivedAt: opportunity.archivedAt,
        archiveReason: opportunity.archiveReason,
        stage: opportunity.stage,
        stageChanges: opportunity.stageChanges,
        owner: opportunity.owner,
        tags: opportunity.tags,
        sources: opportunity.sources,
        origin: opportunity.origin,
        sourcedBy: opportunity.sourcedBy,
        applications: opportunity.applications,
        resume: opportunity.resume,
        followers: opportunity.followers,
        urls: opportunity.urls,
        dataProtection: opportunity.dataProtection,
        isAnonymized: opportunity.isAnonymized,
        opportunityLocation: opportunity.opportunityLocation
    };
}
