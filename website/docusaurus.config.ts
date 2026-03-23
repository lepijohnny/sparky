import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Sparky — Desktop AI Assistant',
  tagline: 'Modern, fast, minimal desktop AI assistant with RAG, skills, and multi-provider support',
  favicon: 'img/favicon.png',

  headTags: [
    { tagName: 'meta', attributes: { name: 'description', content: 'Sparky is a modern desktop AI assistant with RAG knowledge base, skills, and support for Anthropic, OpenAI, Google, Copilot, and Ollama.' } },
    { tagName: 'meta', attributes: { name: 'keywords', content: 'AI assistant, desktop AI, RAG, knowledge base, Anthropic, OpenAI, Ollama, Copilot, Google Gemini, LLM, developer tools' } },
    { tagName: 'meta', attributes: { property: 'og:type', content: 'website' } },
    { tagName: 'meta', attributes: { property: 'og:title', content: 'Sparky — Desktop AI Assistant' } },
    { tagName: 'meta', attributes: { property: 'og:description', content: 'Modern, fast, minimal desktop AI assistant with RAG, skills, and multi-provider support.' } },
    { tagName: 'meta', attributes: { property: 'og:image', content: 'https://getsparky.chat/img/sparky-logo.png' } },
    { tagName: 'meta', attributes: { name: 'twitter:card', content: 'summary_large_image' } },
  ],

  future: {
    v4: true,
  },

  markdown: {
    mermaid: true,
  },

  themes: ['@docusaurus/theme-mermaid'],

  url: 'https://getsparky.chat',
  baseUrl: '/',

  organizationName: 'nicolaradin',
  projectName: 'sparky',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/sparky-logo.png',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Sparky',
      logo: {
        alt: 'Sparky',
        src: 'img/sparky-logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/lepijohnny/sparky',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub repository',
        },
      ],
    },

    footer: {
      style: 'dark',
      copyright: `Copyright © ${new Date().getFullYear()} Sparky. Built with Docusaurus.`,
    },
    mermaid: {
      theme: { light: 'neutral', dark: 'dark' },
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'toml', 'rust'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
