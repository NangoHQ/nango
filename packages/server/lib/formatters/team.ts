import type { ApiTeam, DBTeam } from '@nangohq/types';

export function teamToApi({ workos_organization_id: _workosOrganizationId, ...team }: DBTeam): ApiTeam {
    return {
        ...team,
        created_at: team.created_at.toISOString(),
        updated_at: team.updated_at.toISOString()
    };
}
