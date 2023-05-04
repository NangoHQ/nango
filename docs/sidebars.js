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
            label: 'Nango Auth (OAuth)',
            items: [
                {
                    id: 'nango-auth/core-concepts',
                    type: 'doc',
                    label: 'Auth Core Concepts'
                },
                {
                    id: 'nango-auth/frontend-sdk',
                    type: 'doc',
                    label: 'Frontend SDK'
                },
                {
                    type: 'category',
                    label: 'Backend SDKs & API',
                    items: [
                        {
                            id: 'nango-auth/node-sdk',
                            type: 'doc',
                            label: 'Node SDK'
                        },
                        {
                            id: 'nango-auth/connections-api',
                            type: 'doc',
                            label: 'Connections API'
                        }
                    ]
                },
                {
                    id: 'nango-auth/configuration',
                    type: 'doc',
                    label: 'Advanced Configuration'
                }
            ]
        },
        {
            type: 'category',
            label: 'Nango Unified APIs',
            items: [
                {
                    type: 'category',
                    label: 'Unified HRIS API',
                    link: {
                        id: 'unified-apis/hris/overview',
                        type: 'doc'
                    },
                    items: [
                        {
                            id: 'unified-apis/hris/employees',
                            type: 'doc',
                            label: '/employees'
                        }
                    ]
                },
                {
                    id: 'unified-apis/proxy',
                    type: 'doc',
                    label: 'Proxy'
                }
            ]
        },
        {
            type: 'category',
            label: 'Supported APIs',
            link: {
                type: 'generated-index',
                title: 'Nango Supported OAuth APIs and REST API Wikis',
                description:
                    'For every OAuth API that Nango supports we maintain a small API wiki with all our learnings. Feel free to contribute yours as well!',
                slug: '/providers'
            },
            items: [
                'providers/accelo',
                'providers/adobe',
                'providers/airtable',
                'providers/amazon',
                'providers/asana',
                'providers/atlassian',
                'providers/bamboohr',
                'providers/battlenet',
                'providers/bitbucket',
                'providers/boldsign',
                'providers/box',
                'providers/braintree',
                'providers/brex',
                'providers/calendly',
                'providers/clickup',
                'providers/confluence',
                'providers/contentstack',
                'providers/deel',
                'providers/digitalocean',
                'providers/discord',
                'providers/dropbox',
                'providers/docusign',
                'providers/epic-games',
                'providers/facebook',
                'providers/factorial',
                'providers/figjam',
                'providers/figma',
                'providers/fitbit',
                'providers/freshbooks',
                'providers/front',
                'providers/github',
                'providers/gitlab',
                'providers/google',
                'providers/google-calendar',
                'providers/google-mail',
                'providers/google-sheet',
                'providers/gorgias',
                'providers/greenhouse',
                'providers/gusto',
                'providers/hubspot',
                'providers/healthgorilla',
                'providers/instagram',
                'providers/intercom',
                'providers/intuit',
                'providers/jira',
                'providers/keap',
                'providers/lever',
                'providers/linear',
                'providers/linkedin',
                'providers/mailchimp',
                'providers/microsoft-teams',
                'providers/miro',
                'providers/monday',
                'providers/mural',
                'providers/notion',
                'providers/one-drive',
                'providers/outreach',
                'providers/pagerduty',
                'providers/pandadoc',
                'providers/payfit',
                'providers/pipedrive',
                'providers/qualtrics',
                'providers/quickbooks',
                'providers/ramp',
                'providers/reddit',
                'providers/sage',
                'providers/salesforce',
                'providers/salesloft',
                'providers/segment',
                'providers/shopify',
                'providers/slack',
                'providers/smugmug',
                'providers/splitwise',
                'providers/spotify',
                'providers/squareup',
                'providers/stackexchange',
                'providers/strava',
                'providers/stripe',
                'providers/teamwork',
                'providers/todoist',
                'providers/timely',
                'providers/trello',
                'providers/twitch',
                'providers/twitter',
                'providers/typeform',
                'providers/uber',
                'providers/wakatime',
                'providers/wave_accounting',
                'providers/xero',
                'providers/yahoo',
                'providers/yandex',
                'providers/youtube',
                'providers/zapier-nla',
                'providers/zendesk',
                'providers/zenefits',
                'providers/zoho-crm',
                'providers/zoho-desk',
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
