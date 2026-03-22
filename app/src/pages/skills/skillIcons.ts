import {
  Bot, Brain, Bug, Code, Database, FileSearch, FlaskConical, Globe,
  Image, Languages, LayoutDashboard, LineChart, Lock, Mail, MessageSquare,
  Microscope, Music, Pencil, Puzzle, Rocket, Search, Shield, Sparkles,
  Terminal, TestTube, Video, Wand2, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  bot: Bot,
  brain: Brain,
  bug: Bug,
  code: Code,
  database: Database,
  "file-search": FileSearch,
  flask: FlaskConical,
  globe: Globe,
  image: Image,
  languages: Languages,
  layout: LayoutDashboard,
  chart: LineChart,
  lock: Lock,
  mail: Mail,
  message: MessageSquare,
  microscope: Microscope,
  music: Music,
  pencil: Pencil,
  puzzle: Puzzle,
  rocket: Rocket,
  search: Search,
  shield: Shield,
  sparkles: Sparkles,
  terminal: Terminal,
  test: TestTube,
  video: Video,
  wand: Wand2,
  wrench: Wrench,
  zap: Zap,
};

export function getSkillIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Puzzle;
}
