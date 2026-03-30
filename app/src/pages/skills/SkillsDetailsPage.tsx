import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { getSkillIcon } from "./skillIcons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useConnection } from "../../context/ConnectionContext";
import { useToasts } from "../../context/ToastContext";
import { useStore } from "../../store";
import type { Skill, SkillState } from "../../types/skill";
import type { SkillFileData } from "../../store/skills";
import CodeBlock from "../../components/chat/CodeBlock";
import shared from "../../styles/shared.module.css";
import styles from "./SkillsDetailsPage.module.css";

interface SkillsDetailsPageProps {
  skillId: string;
}

interface StepDef {
  key: string;
  label: string;
}

const STEPS: StepDef[] = [
  { key: "pending", label: "Pending" },
  { key: "audited", label: "Audited" },
  { key: "bins", label: "Bins" },
  { key: "secrets", label: "Secrets" },
  { key: "active", label: "Active" },
];

const MD_EXTENSIONS = new Set([".md", ".mdx"]);
const SKILL_FILES = new Set(["SKILL.md", "AGENT.md"]);

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n?/);
  return match ? content.slice(match[0].length).trimStart() : content;
}

function langOf(name: string): string {
  const ext = extOf(name);
  const map: Record<string, string> = {
    ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
    ".py": "python", ".sh": "bash", ".bash": "bash", ".zsh": "zsh",
    ".js": "javascript", ".ts": "typescript", ".jsx": "jsx", ".tsx": "tsx",
    ".html": "html", ".css": "css", ".xml": "xml", ".svg": "xml",
    ".rs": "rust", ".go": "go", ".rb": "ruby", ".lua": "lua",
    ".txt": "text", ".env": "text", ".ini": "ini", ".cfg": "ini",
  };
  return map[ext] ?? "text";
}

function getStepStatuses(skill: Skill): ("done" | "current" | "failed" | "")[] {
  const hasReqs = !!skill.requirements;
  const audited = hasReqs && skill.requirements!.safe;
  const rejected = hasReqs && !skill.requirements!.safe;
  const binsOk = !skill.binsMissing;
  const secretsOk = !skill.secretsMissing;
  const isActive = skill.state === "active";

  if (rejected) return ["done", "failed", "", "", ""];
  if (isActive) return ["done", "done", "done", "done", "done"];
  if (!hasReqs) return ["current", "", "", "", ""];

  return [
    "done",
    audited ? "done" : "current",
    audited ? (binsOk ? "done" : "current") : "",
    audited && binsOk ? (secretsOk ? "done" : "current") : "",
    audited && binsOk && secretsOk ? "current" : "",
  ];
}

function StepTooltip({ step, status, skill }: { step: StepDef; status: string; skill: Skill }) {
  const req = skill.requirements;

  if (step.key === "audited") {
    if (status === "failed") return <div className={styles.tooltip}><div className={styles.tipTitle}>Audit Failed</div>{req?.notes && <div className={styles.tipHint}>{req.notes}</div>}</div>;
    if (status === "done") return <div className={styles.tooltip}><div className={styles.tipTitle}>Audit Passed</div>{req?.notes && <div className={styles.tipHint}>{req.notes}</div>}</div>;
    return <div className={styles.tooltip}><div className={styles.tipTitle}>Awaiting Review</div><div className={styles.tipHint}>Use the skills assistant to review this skill.</div></div>;
  }

  if (step.key === "bins" && req) {
    if (req.bins.length === 0) return <div className={styles.tooltip}><div className={styles.tipTitle}>No binaries required</div></div>;
    return (
      <div className={styles.tooltip}>
        <div className={styles.tipTitle}>Required Binaries</div>
        <div className={styles.tipList}>
          {req.bins.map((b) => (
            <div key={b.name} className={styles.tipItem}>
              {b.installed ? <Check size={11} className={styles.tipOk} /> : <X size={11} className={styles.tipMissing} />}
              <span className={b.installed ? styles.tipOk : styles.tipMissing}>{b.name}</span>
              {!b.installed && b.install && <span style={{ opacity: 0.5 }}>— {b.install}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (step.key === "secrets" && req) {
    const envItems = req.env.length > 0 ? req.env : null;
    const groupEntries = Object.entries(req.groups);
    if (!envItems && groupEntries.length === 0) return <div className={styles.tooltip}><div className={styles.tipTitle}>No secrets required</div></div>;
    return (
      <div className={styles.tooltip}>
        <div className={styles.tipTitle}>Required Secrets</div>
        <div className={styles.tipList}>
          {envItems?.map((e) => (
            <div key={e.name} className={styles.tipItem}>
              {e.present ? <Check size={11} className={styles.tipOk} /> : <X size={11} className={styles.tipMissing} />}
              <span className={e.present ? styles.tipOk : styles.tipMissing}>{e.name}</span>
              {e.hint && <span style={{ opacity: 0.5 }}>— {e.hint}</span>}
            </div>
          ))}
        </div>
        {groupEntries.map(([key, group]) => (
          <div key={key} className={styles.tipHint}>{group.satisfied ? "✓" : "✗"} {group.hint ?? `Group "${key}": need ${group.min}`}</div>
        ))}
      </div>
    );
  }

  return null;
}

const HOVER_DELAY = 350;

function PipelineRow({ steps, statuses, skill }: { steps: StepDef[]; statuses: string[]; skill: Skill }) {
  const [visibleIdx, setVisibleIdx] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleEnter(idx: number) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisibleIdx(idx), HOVER_DELAY);
  }

  function handleLeave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisibleIdx(null);
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div className={styles.pipeline}>
      {steps.map((step, idx) => {
        const status = statuses[idx];
        const lineDone = idx > 0 && statuses[idx - 1] === "done";
        return (
          <span key={step.key} style={{ display: "contents" }}>
            {idx > 0 && <div className={`${styles.stepConnector} ${lineDone ? styles.done : ""}`} />}
            <div
              className={`${styles.stepCol} ${status ? styles[status] : ""}`}
              onMouseEnter={() => handleEnter(idx)}
              onMouseLeave={handleLeave}
            >
              <div className={styles.stepDot} />
              <span className={styles.stepLabel}>{step.label}</span>
              {visibleIdx === idx && <StepTooltip step={step} status={status} skill={skill} />}
            </div>
          </span>
        );
      })}
    </div>
  );
}

export default function SkillsDetailsPage({ skillId }: SkillsDetailsPageProps) {
  const { conn } = useConnection();
  const { addToast } = useToasts();
  const skills = useStore((s) => s.skills);
  const skill = skills.find((s) => s.id === skillId);
  const [activeTab, setActiveTab] = useState(0);
  const files = useStore((s) => s.skillFiles[skillId] ?? []);

  const prevSkillRef = useRef(skillId);
  if (prevSkillRef.current !== skillId) {
    prevSkillRef.current = skillId;
    setActiveTab(0);
  }

  

  if (!skill) {
    return (
      <div className={styles.page}>
        <p style={{ color: "var(--fg-muted)", fontStyle: "italic" }}>Skill not found.</p>
      </div>
    );
  }

  const stepStatuses = getStepStatuses(skill);
  const isActive = skill.state === "active";
  const canActivate = !isActive && !skill.binsMissing && !skill.secretsMissing && skill.state === "verified";

  const handleToggle = async () => {
    if (!conn) return;
    try {
      if (isActive) {
        await conn.request("skills.deactivate", { id: skill.id });
      } else if (canActivate) {
        await conn.request("skills.activate", { id: skill.id });
      }
    } catch (err: any) {
      addToast({ id: `skill_err_${Date.now()}`, kind: "error", title: err?.message ?? "Failed to activate skill" });
    }
  };

  const activeFile = files[activeTab];
  const isMd = activeFile ? MD_EXTENSIONS.has(extOf(activeFile.name)) : false;
  const isSkillFile = activeFile ? SKILL_FILES.has(activeFile.name) : false;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.headerRow}>
        <div className={styles.headerInfo}>
          <div className={styles.titleRow}>
            {(() => { const Icon = getSkillIcon(skill.icon); return <Icon size={20} strokeWidth={1.5} />; })()}
            <h2 className={styles.title}>{skill.name}</h2>
          </div>
          {skill.description && <p className={styles.description}>{skill.description}</p>}
          <div className={styles.metaRow}>
            <span className={styles.skillId}>{skill.id}</span>
            {skill.author && <><span className={styles.metaDot}>·</span><span>by {skill.author}</span></>}
            {skill.version && <><span className={styles.metaDot}>·</span><span>v{skill.version}</span></>}
            {skill.license && <><span className={styles.metaDot}>·</span><span>{skill.license}</span></>}
            {skill.source && <><span className={styles.metaDot}>·</span><span>{skill.source}</span></>}
          </div>
        </div>
        <button
          className={`${styles.toggle} ${isActive ? styles.on : ""} ${!canActivate && !isActive ? styles.disabled : ""}`}
          onClick={handleToggle}
          disabled={!canActivate && !isActive}
          title={!canActivate && !isActive ? "Complete all checks to activate" : isActive ? "Deactivate" : "Activate"}
        >
          <div className={styles.toggleKnob} />
        </button>
      </div>

      {/* Status pipeline card */}
      <div className={styles.statusCard}>
        <div className={shared.cardHeader}>Status</div>
        <div className={styles.statusBody}>
          <PipelineRow steps={STEPS} statuses={stepStatuses} skill={skill} />
        </div>
        {skill.state === "pending" && (
          <p className={styles.hint}>This skill needs to be audited before it can be activated. Ask the agent to review it.</p>
        )}
      </div>

      {/* Files tabbed card */}
      <div className={styles.filesCard} style={{ visibility: files.length > 0 ? "visible" : "hidden" }}>
        <div className={styles.tabBar}>
          {files.map((f, idx) => (
            <button
              key={f.name}
              className={`${styles.tab} ${idx === activeTab ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(idx)}
            >
              {f.name}
            </button>
          ))}
        </div>
        <div className={styles.fileContent}>
          <div key={`${skillId}-${activeTab}`} className={styles.fileInner}>
            {activeFile && isSkillFile ? (
              <div className={styles.skillDoc}>
                <h1 className={styles.skillTitle}>{skill.name}</h1>
                {skill.description && <p className={styles.skillDesc}>{skill.description}</p>}
                <div className={styles.markdown}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {stripFrontmatter(activeFile.content)}
                  </ReactMarkdown>
                </div>
              </div>
            ) : activeFile && isMd ? (
              <div className={styles.markdown}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {activeFile.content}
                </ReactMarkdown>
              </div>
            ) : activeFile ? (
              <CodeBlock code={activeFile.content} language={langOf(activeFile.name)} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
