import { expect, describe, it, vi } from 'vitest';
import FlowService, { Config } from './flow.service';

const flows = {
    integrations: {
        github: {
            'github-issues': {
                runs: 'every half hour',
                returns: ['GithubIssue'],
                description:
                    "Fetches the Github issues from all a user's repositories.\nDetails: full sync, doesn't track deletes, metadata is not required.\nScope(s): repo or public_repo\n"
            },
            'github-issues-lite': {
                runs: 'every day',
                auto_start: false,
                returns: ['GithubIssue'],
                description:
                    "Fetches the Github issues but up to a maximum of 15 for demo\npurposes.\nDetails: limited sync, doesn't track deletes, metadata is not required.\nScope(s): repo or public_repo\n"
            },
            'github-list-files-sync': {
                type: 'sync',
                runs: 'every hour',
                auto_start: false,
                returns: ['GithubRepoFile']
            },
            'github-list-repos-action': {
                type: 'action',
                returns: ['GithubRepo']
            },
            'github-write-file-action': {
                type: 'action'
            },
            models: {
                GithubIssue: {
                    id: 'integer',
                    owner: 'string',
                    repo: 'string',
                    issue_number: 'number',
                    title: 'string',
                    author: 'string',
                    author_id: 'string',
                    state: 'string',
                    date_created: 'date',
                    date_last_modified: 'date',
                    body: 'string'
                },
                GithubRepo: {
                    id: 'integer',
                    owner: 'string',
                    name: 'string',
                    full_name: 'string',
                    description: 'string',
                    url: 'string',
                    date_created: 'date',
                    date_last_modified: 'date'
                },
                GithubRepoFile: {
                    id: 'string',
                    name: 'string',
                    url: 'string',
                    last_modified_date: 'date'
                }
            }
        },
        gmail: {
            'gmail-emails': {
                runs: 'every hour',
                returns: ['GmailEmail']
            },
            models: {
                GmailEmail: {
                    id: 'string',
                    sender: 'string',
                    recipients: 'string',
                    date: 'date',
                    subject: 'string',
                    body: 'string',
                    threadId: 'string'
                }
            }
        },
        google: {
            'google-workspace-org-unit': {
                runs: 'every 6 hours',
                track_deletes: true,
                returns: ['OrganizationalUnit']
            },
            'google-workspace-users': {
                runs: 'every hour',
                returns: ['User']
            },
            'google-workspace-user-access-tokens': {
                runs: 'every hour',
                returns: ['GoogleWorkspaceUserToken']
            },
            models: {
                OrganizationalUnit: {
                    id: 'string',
                    name: 'string',
                    createdAt: 'string | null',
                    deletedAt: 'string | null',
                    description: 'string | null',
                    path: 'string | null',
                    parentPath: 'string | null',
                    parentId: 'string | null'
                },
                User: {
                    id: 'string',
                    email: 'string',
                    displayName: 'string | null',
                    givenName: 'string | null',
                    familyName: 'string | null',
                    picture: 'string | null | undefined',
                    type: 'string',
                    createdAt: 'string | null',
                    deletedAt: 'string | null',
                    phone: {
                        value: 'string | null | undefined',
                        type: 'string | null | undefined'
                    },
                    organizationId: 'string | null | undefined',
                    organizationPath: 'string | null | undefined',
                    isAdmin: 'boolean | null',
                    department: 'string | null'
                },
                GoogleWorkspaceUserToken: {
                    id: 'string',
                    user_id: 'string',
                    app_name: 'string',
                    anonymous_app: 'boolean',
                    scopes: 'string'
                }
            },
            rawName: 'google-workspace'
        }
    }
};

describe('Flow service tests', () => {
    it('Fetch a flow config by providing a name', () => {
        vi.spyOn(FlowService, 'getAllAvailableFlows').mockImplementation(() => {
            return flows as unknown as Config;
        });

        const flow = FlowService.getFlow('github-issues-lite');
        expect(flow).not.toBeNull();
        expect(flow?.model_schema).not.toBeUndefined();
    });
});
