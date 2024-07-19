import type { ApiTeam, DBTeam } from '@nangohq/types';

export function teamToApi(team: DBTeam): ApiTeam {
    return {
        ...team,
        created_at: team.created_at.toISOString(),
        updated_at: team.updated_at.toISOString()
    };
}
