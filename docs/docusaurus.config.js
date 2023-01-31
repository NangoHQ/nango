// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require('prism-react-renderer/themes/github');
const darkCodeTheme = require('prism-react-renderer/themes/dracula');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Nango Docs',
  tagline: 'Documentation for the Nango project',
  url: 'https://docs.nango.dev',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/nango-favicon.svg',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'nangohq', // Usually your GitHub org/user name.
  projectName: 'nango-sync', // Usually your repo name.
  deploymentBranch: 'gh-pages',
  trailingSlash: false,

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    ['docusaurus-gtm-plugin',
    {
      id: 'GTM-N4KVPWR'
    }],
  ],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/nangohq/nango/tree/main/docs/',
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
        sitemap: {
          changefreq: 'weekly',
          priority: 0.8,
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      metadata: [{
        name: 'keywords',
        content: 'nango, sync api, sync endpoint, data sync, sync to database, sync to db, continuous sync, native integrations, integrations, customer-facing integrations, open-source framework, open-source, nango docs, nango documentation'
      }, {
        name: 'description',
        content: 'The documentation for the api endpoint sync project Nango'
      }],
      docs: {
        sidebar: {
          autoCollapseCategories: false,
        },
      },
      navbar: {
        title: 'Docs',
        logo: {
          alt: 'Nango Docs',
          src: 'img/nango-favicon.svg',
        },
        items: [
          {
            type: 'doc',
            docId: 'introduction',
            label: 'Nango',
            position: 'left'
          },
          {
            type: 'doc',
            docId: 'nango-sync/introduction',
            position: 'left',
            label: 'Nango Sync',
          },
          {
            label: 'Community Slack',
            href: 'https://nango.dev/slack',
            position: 'right',
          },
          {
            href: 'https://github.com/nangohq/nango',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {
                label: 'Intro to Nango',
                to: '/',
              },
              {
                label: 'Quickstart 🚀',
                to: '/quickstart',
              }
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'GitHub',
                href: 'https://github.com/NangoHQ/nango',
              },
              {
                label: 'Slack',
                href: 'https://nango.dev/slack',
              },
              {
                label: 'Twitter',
                href: 'https://twitter.com/nangohq',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'Nango Blog',
                href: 'https://www.nango.dev/blog',
              },
              {
                label: 'Nango Website',
                href: 'https://www.nango.dev',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Nango`,
      },
      colorMode: {
        respectPrefersColorScheme: true
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
      algolia: {
        appId: '8371GL7KV8',
        apiKey: '17bc63b70c9c3b047df5ef1cd41a7732',
        indexName: 'nangonango',
      },
    }), 
};

module.exports = config;
