export interface CalendlyUser {
    resource: {
        uri: string;
        name: string;
        slug: string;
        email: string;
        scheduling_url: string;
        timezone: string;
        avatar_url: string;
        created_at: string;
        updated_at: string;
        current_organization: string;
        resource_type: string;
        locale: string;
    };
}
