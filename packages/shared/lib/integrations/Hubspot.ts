export interface Contact {
    id: number;
    properties: {
        email: string;
        lastname: string;
        firstname: string;
        createdate: string;
        lastmodifieddate: string;
        company?: string;
        phone?: string;
        website?: string;
    };
}

export interface Deal {
    id: number;
    properties: {
        amount: string;
        closedate: string;
        createdate: string;
        dealname: string;
        dealstage: string;
        hs_lastmodifieddate: string;
        hubspot_owner_id: string;
        pipeline: string;
    };
}

export interface APIResponse<T> {
    results: T[];
    paging: {
        next: {
            after: string;
            link: string;
        };
    };
}
