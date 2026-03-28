import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
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

export default function Home() {
  const b = useBaseUrl;
  return (
    <Layout title="Private AI Assistant" description="A private, local-first desktop AI assistant with multi-provider LLM support, built-in knowledge base, and service integrations.">
      <section className={styles.hero}>
        <img
          src={b('/img/sparky-logo.png')}
          alt="Sparky"
          className={styles.logo}
        />
        <h1 className={styles.title}>Sparky</h1>
        <p className={styles.tagline}>
          Sparky is a desktop app that turns AI automation into a conversation. Connect agents, query your local documents, and integrate external services — all from a single, intuitive chat interface. Instead of stitching together pipelines and tools, you describe what you want and your agent handles the rest.
        </p>
        <div className={styles.badges}>
          <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue" />
          <img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-green" />
          <img alt="Version" src="https://img.shields.io/github/v/release/lepijohnny/sparky?color=orange" />
        </div>
        <div className={styles.actions}>
          <Link to="/docs/getting-started/introduction" className={styles.primaryBtn}>
            Get Started
          </Link>
          <Link to="https://github.com/lepijohnny/sparky" className={styles.secondaryBtn}>
            GitHub
          </Link>
        </div>
      </section>

      <div className={styles.screenshotWrap}>
        <video
          src={b('/docs/assets/anchors-labels.mp4')}
          autoPlay muted loop playsInline
          className={styles.screenshot}
        />
      </div>

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

      <section className={styles.cta}>
        <h2 className={styles.ctaTitle}>Ready to try Sparky?</h2>
        <p className={styles.ctaDesc}>Check the docs for build instructions and setup guide.</p>
        <Link to="/docs/getting-started/installation" className={styles.primaryBtn}>
          Installation Guide
        </Link>
      </section>
    </Layout>
  );
}
