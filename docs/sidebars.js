// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
    docsSidebar: [
        'nango-sync/introduction',
        'nango-sync/quickstart',
        {
            type: 'category',
            label: 'Use Nango Sync',
            items: [
                {
                    id: 'nango-sync/use-nango/core-concepts',
                    type: 'doc',
                    label: 'Core concepts'
                },
                {
                    type: 'category',
                    label: 'Create Syncs',
                    items: [
                        {
                            id: 'nango-sync/use-nango/sync-all-options',
                            type: 'doc',
                            label: 'All Options'
                        },
                        {
                            id: 'nango-sync/use-nango/sync-modes',
                            type: 'doc',
                            label: 'Modes'
                        },
                        {
                            id: 'nango-sync/use-nango/sync-schedule',
                            type: 'doc',
                            label: 'Scheduling'
                        },
                        {
                            id: 'nango-sync/use-nango/sync-metadata',
                            type: 'doc',
                            label: 'Metadata'
                        },
                        {
                            id: 'nango-sync/use-nango/sync-pagination',
                            type: 'doc',
                            label: 'Pagination'
                        },
                        {
                            id: 'nango-sync/use-nango/sync-auth',
                            type: 'doc',
                            label: 'Authentication'
                        }
                    ]
                },
                {
                    id: 'nango-sync/use-nango/manage-syncs',
                    type: 'doc',
                    label: 'Manage Syncs'
                },
                {
                    id: 'nango-sync/use-nango/sync-notifications',
                    type: 'doc',
                    label: 'Sync Notifications'
                },
                {
                    id: 'nango-sync/use-nango/schema-mappings',
                    type: 'doc',
                    label: 'Schema mappings'
                },
                {
                    id: 'nango-sync/use-nango/db-config',
                    type: 'doc',
                    label: 'DB Configuration'
                },
                {
                    id: 'nango-sync/use-nango/observability',
                    type: 'doc',
                    label: 'Observability'
                }
            ]
        },
        {
            id: 'nango-sync/real-world-examples',
            type: 'doc',
            label: 'Examples'
        },
        {
            id: 'nango-sync/architecture',
            type: 'doc',
            label: 'Architecture & Vision'
        },
        {
            id: 'nango-sync/license-faq',
            type: 'doc',
            label: 'License FAQ & Pricing'
        },
        'nango-sync/contributing'
    ],
    nango: [
        'introduction',
        'quickstart',
        {
            type: 'category',
            label: 'Reference',
            items: [
                {
                    id: 'reference/cli',
                    type: 'doc',
                    label: 'Nango CLI'
                },
                {
                    id: 'reference/frontend-sdk',
                    type: 'doc',
                    label: 'Frontend SDK'
                },
                // {
                //     id: 'reference/backend-sdk-rest-api',
                //     type: 'doc',
                //     label: 'Backend SDK & REST API'
                // },
                {
                    id: 'reference/configuration',
                    type: 'doc',
                    label: 'Advanced Configuration'
                }
            ]
        },
        {
            type: 'category',
            label: 'Provider Wikis',
            link: {
                type: 'generated-index',
                title: 'Nango Provider API Wikis',
                description: 'For every API that Nango supports we maintain a small API wiki with all our learnings. Feel free to contribute yours as well!',
                slug: '/providers'
            },
            items: [
                'providers/airtable',
                'providers/asana',
                'providers/braintree',
                'providers/brex',
                'providers/bitbucket',
                'providers/clickup',
                'providers/confluence',
                'providers/discord',
                'providers/dropbox',
                'providers/epic-games',
                'providers/facebook',
                'providers/fitbit',
                'providers/freshbooks',
                'providers/front',
                'providers/github',
                'providers/gitlab',
                'providers/google',
                'providers/google-calendar',
                'providers/google-mail',
                'providers/google-sheet',
                'providers/greenhouse',
                'providers/hubspot',
                'providers/intercom',
                'providers/intuit',
                'providers/instagram',
                'providers/jira',
                'providers/lever',
                'providers/linear',
                'providers/linkedin',
                'providers/microsoft-teams',
                'providers/monday',
                'providers/notion',
                'providers/outreach',
                'providers/pagerduty',
                'providers/pipedrive',
                'providers/quickbooks',
                'providers/ramp',
                'providers/reddit',
                'providers/sage',
                'providers/salesforce',
                'providers/salesloft',
                'providers/shopify',
                'providers/slack',
                'providers/splitwise',
                'providers/stackexchange',
                'providers/stripe',
                'providers/trello',
                'providers/twitter',
                'providers/wave_accounting',
                'providers/xero',
                'providers/youtube',
                'providers/zendesk',
                'providers/zoho-crm',
                'providers/zoho-invoice',
                'providers/zoho-books',
                'providers/zoom'
            ]
        },
        {
            id: 'cloud',
            type: 'doc',
            label: 'Nango Cloud'
        },
        {
            type: 'category',
            label: 'Nango Self Hosted',
            link: {
                type: 'generated-index',
                title: 'Nango Self Hosted',
                description: 'Self-host Nango on a single machine using Docker.',
                slug: '/category/deploy-nango-self-hosted'
            },
            items: [
                {
                    id: 'nango-deploy/oss-instructions',
                    type: 'doc',
                    label: 'Self-Hosting Instructions'
                },
                {
                    id: 'nango-deploy/local',
                    type: 'doc',
                    label: 'On Your Local Machine'
                },
                {
                    id: 'nango-deploy/aws',
                    type: 'doc',
                    label: 'On AWS'
                },
                {
                    id: 'nango-deploy/gcp',
                    type: 'doc',
                    label: 'On GCP'
                },
                {
                    id: 'nango-deploy/digital-ocean',
                    type: 'doc',
                    label: 'On Digital Ocean'
                },
                {
                    id: 'nango-deploy/render',
                    type: 'doc',
                    label: 'On Render'
                },
                {
                    id: 'nango-deploy/heroku',
                    type: 'doc',
                    label: 'On Heroku'
                }
            ]
        },
        'contribute-api'
    ]

    // But you can create a sidebar manually
    /*
  tutorialSidebar: [
    {
      type: 'category',
      label: 'Tutorial',
      items: ['hello'],
    },
  ],
   */
};

module.exports = sidebars;
