export interface TerraformOrganizationsResponse {
    data: TerraformOrganization[];
}

export interface TerraformOrganization {
    id: string;
    type: string;
    attributes: {
        'external-id': string;
        'created-at': string;
        email: string;
        'session-timeout': unknown;
        'session-remember': unknown;
        'collaborator-auth-policy': string;
        'plan-expired': boolean;
        'plan-expires-at': unknown;
        'plan-is-trial': boolean;
        'plan-is-enterprise': boolean;
        'plan-identifier': string;
        'cost-estimation-enabled': boolean;
        'managed-resource-count': number;
        'send-passing-statuses-for-untriggered-speculative-plans': boolean;
        'allow-force-delete-workspaces': boolean;
        'assessments-enforced': boolean;
        'is-in-degraded-mode': boolean;
        'default-execution-mode': string;
        'remaining-testable-count': number;
        'aggregated-commit-status-enabled': boolean;
        'speculative-plan-management-enabled': boolean;
        name: string;
        permissions: {
            'can-update': boolean;
            'can-update-authentication': boolean;
            'can-destroy': boolean;
            'can-access-via-teams': boolean;
            'can-create-module': boolean;
            'can-create-team': boolean;
            'can-create-workspace': boolean;
            'can-manage-users': boolean;
            'can-manage-subscription': boolean;
            'can-manage-sso': boolean;
            'can-update-oauth': boolean;
            'can-update-sentinel': boolean;
            'can-update-ssh-keys': boolean;
            'can-update-api-token': boolean;
            'can-traverse': boolean;
            'can-view-usage': boolean;
            'can-update-agent-pools': boolean;
            'can-manage-tags': boolean;
            'can-manage-varsets': boolean;
            'can-read-varsets': boolean;
            'can-manage-public-providers': boolean;
            'can-create-provider': boolean;
            'can-manage-public-modules': boolean;
            'can-manage-custom-providers': boolean;
            'can-manage-run-tasks': boolean;
            'can-read-run-tasks': boolean;
            'can-create-project': boolean;
            'can-enable-stacks': boolean;
            'can-manage-org-public-providers': boolean;
            'can-manage-org-public-modules': boolean;
            'can-manage-assessments': boolean;
            'can-read-assessments': boolean;
            'can-view-explorer': boolean;
            'can-deploy-no-code-modules': boolean;
            'can-manage-no-code-modules': boolean;
            'can-create-change-requests': boolean;
            'can-manage-saved-views': boolean;
            'can-read-saved-views': boolean;
        };
        'stacks-enabled': boolean;
        'over-stacks-beta-resource-limit': boolean;
        'saml-enabled': boolean;
        'fair-run-queuing-enabled': boolean;
        'owners-team-saml-role-id': unknown;
        'two-factor-conformant': boolean;
    };
    relationships: {
        'default-agent-pool': {
            data: unknown;
        };
        meta: {
            links: {
                related: string;
            };
        };
        'oauth-tokens': {
            links: {
                related: string;
            };
        };
        'authentication-token': {
            links: {
                related: string;
            };
        };
        'audit-trails-authentication-token': {
            links: {
                related: string;
            };
        };
        'entitlement-set': {
            data: {
                id: string;
                type: string;
            };
            links: {
                related: string;
            };
        };
        subscription: {
            data: {
                id: string;
                type: string;
            };
            links: {
                related: string;
            };
        };
        'default-project': {
            data: {
                id: string;
                type: string;
            };
            links: {
                related: string;
            };
        };
    };
    links: {
        self: string;
    };
}
