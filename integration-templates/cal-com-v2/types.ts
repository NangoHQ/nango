import type { EventType } from '../models';

export interface EventTypeResponse {
    status: boolean;
    data: {
        eventTypeGroups: EventTypeGroup[];
    };
}

export interface EventTypeGroup {
    teamId: string | null;
    bookerUrl: string;
    membershipRole: string | null;
    profile: {
        slug: string;
        name: string;
        image: string;
    };
    eventTypes: EventType[];
}
