import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useColorMode} from '@docusaurus/theme-common';
import {Brain, Plug, Palette, ShieldCheck, Tags, Zap} from 'lucide-react';
import styles from './index.module.css';

const features = [
  {
    icon: Brain,
    title: 'Local Knowledge Base',
    desc: 'Add documents, URLs, and files. Sparky chunks, embeds, and indexes them locally with hybrid BM25 + vector search and reranking.',
  },
  {
    icon: Plug,
    title: 'Service Connections',
    desc: 'Connect APIs like GitHub, Gmail, Todoist, and Telegram. Built-in proxy with approval system for destructive actions.',
  },
  {
    icon: Palette,
    title: 'Rich Output',
    desc: 'Mermaid diagrams, KaTeX math, ECharts, syntax-highlighted code blocks, sortable tables. All rendered natively.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy First',
    desc: 'All data stored locally in SQLite. Secrets in OS keychain. No telemetry. Your conversations never leave your machine.',
  },
  {
    icon: Tags,
    title: 'Organized Chats',
    desc: 'Flags, nested labels, archives, multi-workspace support, rolling summaries, and knowledge anchors to pin key context.',
  },
  {
    icon: Zap,
    title: 'Multi-Provider',
    desc: 'Anthropic Claude, GitHub Copilot, Google Gemini, Mistral, Ollama. Switch models mid-conversation or go fully offline.',
  },
];

function Screenshots() {
  const {colorMode} = useColorMode();
  const b = useBaseUrl;
  const suffix = colorMode === 'dark' ? 'dark' : 'light';
  return (
    <div className={styles.screenshots}>
      <img
        src={b(`/img/screenshot-chat-${suffix}.png`)}
        alt="Sparky chat interface with agent-generated release notes"
        className={styles.screenshot}
      />
      <img
        src={b(`/img/screenshot-connections-${suffix}.png`)}
        alt="Sparky service connections with Gmail, GitHub, Todoist"
        className={styles.screenshot}
      />
    </div>
  );
}

export default function Home() {
  const b = useBaseUrl;
  return (
    <Layout title="Private AI Assistant" description="Your personal AI workbench — local, private, and connected to everything you use.">
      <section className={styles.hero}>
        <img
          src={b('/img/sparky-logo.png')}
          alt="Sparky"
          className={styles.logo}
        />
        <h1 className={styles.title}>Sparky</h1>
        <p className={styles.tagline}>
          Your personal AI workbench — local, private, and connected to everything you use. Connect services, query your documents, and let agents handle the rest. No cloud, no telemetry, fully yours.
        </p>
        <div className={styles.badges}>
          <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue" />
          <img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-green" />
          <img alt="Version" src="https://img.shields.io/github/v/release/lepijohnny/sparky?color=orange" />
        </div>
        <div className={styles.actions}>
          <Link to="https://github.com/lepijohnny/sparky/releases/latest" className={styles.primaryBtn}>
            Download
          </Link>
          <Link to="/docs/getting-started/introduction" className={styles.secondaryBtn}>
            Get Started
          </Link>
          <Link to="https://github.com/lepijohnny/sparky" className={styles.secondaryBtn}>
            GitHub
          </Link>
        </div>
      </section>

      <Screenshots />

      <section className={styles.features}>
        {features.map((f) => (
          <div key={f.title} className={styles.feature}>
            <div className={styles.featureIcon}>
              <f.icon size={24} strokeWidth={1.5} />
            </div>
            <h3 className={styles.featureTitle}>{f.title}</h3>
            <p className={styles.featureDesc}>{f.desc}</p>
          </div>
        ))}
      </section>

      <section className={styles.providers}>
        <p className={styles.providersTitle}>Works with</p>
        <div className={styles.providerLogos}>
          <img src={b('/icons/providers/anthropic.svg')} alt="Anthropic" className={styles.providerLogo} />
          <img src={b('/icons/providers/openai.svg')} alt="OpenAI" className={styles.providerLogo} />
          <img src={b('/icons/providers/github-copilot-icon.svg')} alt="GitHub Copilot" className={styles.providerLogo} />
          <img src={b('/icons/providers/google.svg')} alt="Google" className={styles.providerLogo} />
          <img src={b('/icons/providers/mistral.svg')} alt="Mistral" className={styles.providerLogo} />
          <img src={b('/icons/providers/ollama.svg')} alt="Ollama" className={styles.providerLogo} />
        </div>
      </section>


    </Layout>
  );
}
