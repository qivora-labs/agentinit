export type AgentTarget = 'cursor' | 'claude' | 'windsurf' | 'copilot';

export type Language = 'typescript-strict' | 'typescript';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export type FragmentCategory = 'architecture' | 'language' | 'framework' | 'library' | 'workflow';

/** How a rule is activated; see the mapping in PRD §5.3. */
export type FragmentScope = 'always' | 'glob' | 'auto' | 'manual';

export interface ProjectProfile {
  root: string;
  mode: 'existing' | 'greenfield';
  /** Null in greenfield mode. */
  packageManager: PackageManager | null;
  srcDir: '' | 'src';
  language: Language;
  /** Package name → resolved version (for example `{ next: '15.3.1' }`). */
  packages: Record<string, string>;
  scripts: Record<string, string>;
  /** Fragment ids. May be empty. Next.js app and pages can coexist. */
  frameworks: string[];
  /** Fragment ids. */
  libraries: string[];
  architecture: { id: string; confidence: number };
  /** Existing folders under srcDir (depth ≤ 2), used for the descriptive ARCHITECTURE.md. */
  folders: string[];
  agents: AgentTarget[];
  existingAgentFiles: string[];
  isMonorepo: boolean;
}

export interface FileOp {
  /** POSIX path, relative to the project root. */
  path: string;
  kind: 'file' | 'managed-block';
  /** Present for managed blocks. */
  blockId?: string;
  content: string;
  target: AgentTarget | 'shared';
}
