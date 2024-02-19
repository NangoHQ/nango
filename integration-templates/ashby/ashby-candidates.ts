import type { AshbyCandidate, NangoSync } from './models';

let nextCursor: string | null = null;

export default async function fetchData(nango: NangoSync) {
    const metadata = (await nango.getMetadata()) || {};
    let candidatelastsyncToken = metadata['candidatelastsyncToken'] ? String(metadata['candidatelastsyncToken']) : '';

    await saveAllCandidates(nango, candidatelastsyncToken);
}

async function saveAllCandidates(nango: NangoSync, candidatelastsyncToken: string) {
    let totalRecords = 0;
    try {
        while (true) {
            const payload = {
                endpoint: '/candidate.list',
                data: {
                    ...(candidatelastsyncToken && { syncToken: candidatelastsyncToken }),
                    cursor: nextCursor,
                    limit: 100
                }
            };
            const response = await nango.post(payload);
            const pageData = response.data.results;
            const mappedCandidates: AshbyCandidate[] = mapCandidate(pageData);
            if (mappedCandidates.length > 0) {
                const batchSize: number = mappedCandidates.length;
                totalRecords += batchSize;
                await nango.batchSave<AshbyCandidate>(mappedCandidates, 'AshbyCandidate');
                await nango.log(`Saving batch of ${batchSize} candidate(s) (total candidate(s): ${totalRecords})`);
            }
            if (response.data.moreDataAvailable) {
                nextCursor = response.data.nextCursor;
            } else {
                candidatelastsyncToken = response.data.syncToken;
                break;
            }
        }

        let metadata = (await nango.getMetadata()) || {};
        metadata['candidatelastsyncToken'] = candidatelastsyncToken;
        await nango.setMetadata(metadata);
    } catch (error: any) {
        throw new Error(`Error in saveAllCandidates: ${error.message}`);
    }
}

function mapCandidate(candidates: any[]): AshbyCandidate[] {
    return candidates.map((candidate) => ({
        id: candidate.id,
        createdAt: candidate.createdAt,
        name: candidate.name,
        primaryEmailAddress: candidate.primaryEmailAddress,
        emailAddresses: candidate.emailAddresses,
        primaryPhoneNumber: candidate.primaryPhoneNumber,
        phoneNumbers: candidate.phoneNumbers,
        socialLinks: candidate.socialLinks,
        tags: candidate.tags,
        position: candidate.position,
        company: candidate.company,
        school: candidate.school,
        applicationIds: candidate.applicationIds,
        resumeFileHandle: candidate.resumeFileHandle,
        fileHandles: candidate.fileHandles,
        customFields: candidate.customFields,
        profileUrl: candidate.profileUrl,
        source: candidate.source,
        creditedToUser: candidate.creditedToUser
    }));
}
