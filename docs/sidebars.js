// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    'nango-sync/introduction',
    'nango-sync/quickstart', 
    {
      type: 'category',
      label: 'Use Nango',
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
            },
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
          id: 'reference/guide',
          type: 'doc',
          label: 'Step-By-Step Guide'
        },
        {
          id: 'reference/cli',
          type: 'doc',
          label: 'CLI'
        },
        {
          id: 'reference/configuration',
          type: 'doc',
          label: 'Other Configuration'
        }
      ]
    },
    {
      type: 'category',
      label: 'Provider Wikis',
      items: [
        'providers/airtable',
        'providers/asana',
        'providers/brex',
        'providers/bitbucket',
        'providers/clickup',
        'providers/discord',
        'providers/dropbox',
        'providers/facebook',
        'providers/freshbooks',
        'providers/front',
        'providers/github',
        'providers/gitlab',
        'providers/google-calendar',
        'providers/google-mail',
        'providers/greenhouse',
        'providers/hubspot',
        'providers/intercom',
        'providers/intuit',
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
        'providers/reddit',
        'providers/sage',
        'providers/salesloft',
        'providers/shopify',
        'providers/slack',
        'providers/splitwise',
        'providers/trello',
        'providers/twitter',
        'providers/wave_accounting',
        'providers/xero',
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
      label: 'Deploy Nango Open Source',
      link: {
        type: 'generated-index',
        title: 'Deploy Nango Open Source',
        description: 'Self-host Nango on a single machine using Docker (❗️read Limitations below before deploying to production).',
        slug: '/category/deploy-nango-sync-open-source'
      },
      items: [
        {
          id: 'nango-deploy/local',
          type: 'doc',
          label: 'On your local machine'
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
          id: 'nango-deploy/oss-limitations',
          type: 'doc',
          label: 'Limitations'
        },
      ]
    },
    'contribute-api',
    'migration'
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
