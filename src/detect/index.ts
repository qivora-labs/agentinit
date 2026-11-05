import { readdirSync, type Dirent } from 'node:fs';
import * as path from 'node:path';
import { AgentInitError } from '../errors.js';
import { ERROR } from '../exit-codes.js';
import type { Registry } from '../registry/load.js';
import {
  filterCompatibleLibraries,
  suggestFragments,
  type RegistryNotice,
} from '../registry/resolve.js';
import type { AgentTarget, ProjectProfile } from '../types.js';
import { findExistingAgentFiles, findLegacyFiles, preselectAgents } from './existing-agents.js';
import {
  detectNextRouters,
  detectSrcDir,
  inferArchitecture,
  listFolders,
  type NextRouters,
} from './layout.js';
import {
  detectPackageManager,
  detectScripts,
  existingFiles,
  readPackageJson,
  resolveVersions,
  type PackageJson,
} from './packages.js';
import {
  assertTypeScriptProject,
  readTsConfig,
  suggestLanguage,
  type TsConfigSettings,
} from './typescript.js';
import { findGitRoot, isMonorepoRoot, type MonorepoTool } from './workspace.js';

/**
 * Next.js App Router fragments share detect packages and differ by `appliesTo`.
 * Router directories decide which ids stay: App, Pages, or both (PRD §3.3).
 */
const NEXT_APP_ROUTERS = new Set(['nextjs-app-router', 'nextjs-app-router-15']);
const NEXT_PAGES_ROUTER = 'nextjs-pages-router';

/**
 * Top-level names from PRD §3.2. `.agentinit` is handled separately because
 * only the directory is ignorable.
 */
const IGNORABLE_ENTRIES = new Set([
  '.git',
  'README.md',
  'LICENSE',
  '.gitignore',
  '.editorconfig',
]);

const NO_PACKAGE_JSON =
  'No package.json found. Run inside a TypeScript project or an empty folder.';

export interface ProjectDraft extends Omit<ProjectProfile, 'agents'> {
  /** Empty means all four agents. The caller applies that default (PRD §3.5). */
  suggestedAgents: AgentTarget[];
}

export type DetectionWarning =
  | { readonly kind: 'unresolved-tsconfig-extends'; readonly message: string }
  | { readonly kind: 'legacy-agent-file'; readonly path: string };

export type DetectionResult =
  | {
      readonly mode: 'greenfield';
      readonly gitRoot: string | null;
      readonly existingAgentFiles: readonly string[];
    }
  | {
      readonly mode: 'existing';
      readonly draft: ProjectDraft;
      readonly notices: readonly RegistryNotice[];
      readonly warnings: readonly DetectionWarning[];
      readonly gitRoot: string | null;
      /** True when this directory is inside a git working tree but is not its root. */
      readonly belowGitRoot: boolean;
    };

/**
 * Monorepo check runs before the TypeScript gate. A JavaScript monorepo root
 * gets these instructions instead of the JavaScript-project error.
 */
export function detectProject(root: string, registry: Registry): DetectionResult {
  const projectRoot = path.resolve(root);
  const pkgJson = readPackageJson(projectRoot);
  if (pkgJson === null) return detectGreenfield(projectRoot);

  const monorepo = isMonorepoRoot(projectRoot, pkgJson);
  if (monorepo.isRoot) throw monorepoRootError(monorepo.tool);

  assertTypeScriptProject(projectRoot, pkgJson);

  const versions = resolveVersions(projectRoot, pkgJson);
  const files = existingFiles(projectRoot, markerFiles(registry));
  const tsconfig = readTsConfig(projectRoot);
  const srcDir = detectSrcDir(projectRoot);
  const folders = listFolders(projectRoot, srcDir);
  const routers = detectNextRouters(projectRoot, srcDir);
  const suggestion = suggestFragments(registry, { packages: versions, files });
  const frameworks = frameworksForRouters(suggestion.frameworks, routers);
  const compatible = filterCompatibleLibraries(registry, suggestion.libraries, frameworks);
  const existingAgentFiles = findExistingAgentFiles(projectRoot);
  const git = gitLocation(projectRoot);

  return {
    mode: 'existing',
    draft: {
      root: projectRoot,
      mode: 'existing',
      name: packageName(pkgJson),
      packageManager: detectPackageManager(projectRoot, pkgJson),
      srcDir,
      language: suggestLanguage(tsconfig),
      packages: knownVersions(versions),
      scripts: detectScripts(pkgJson),
      frameworks,
      libraries: compatible.libraries,
      architecture: inferArchitecture(folders),
      folders,
      existingAgentFiles,
      suggestedAgents: preselectAgents(existingAgentFiles),
      isMonorepo: monorepo.isRoot,
    },
    notices: [...suggestion.notices, ...compatible.notices],
    warnings: [...tsconfigWarnings(tsconfig), ...legacyWarnings(projectRoot)],
    gitRoot: git.gitRoot,
    belowGitRoot: git.belowGitRoot,
  };
}

function detectGreenfield(root: string): DetectionResult {
  if (!isGreenfieldDirectory(root)) {
    throw new AgentInitError(NO_PACKAGE_JSON, { exitCode: ERROR });
  }
  return {
    mode: 'greenfield',
    gitRoot: findGitRoot(root),
    existingAgentFiles: findExistingAgentFiles(root),
  };
}

/**
 * Only this directory's own entries count. Contents of `.git` and `.agentinit`
 * are not inspected. A name the PRD does not list makes the folder non-empty.
 */
function isGreenfieldDirectory(root: string): boolean {
  for (const entry of readRootEntries(root)) {
    if (!isIgnorableEntry(entry)) return false;
  }
  return true;
}

function isIgnorableEntry(entry: Dirent): boolean {
  if (IGNORABLE_ENTRIES.has(entry.name)) return true;
  // A file named `.agentinit` is project content. The manifest directory is not.
  return entry.name === '.agentinit' && entry.isDirectory();
}

function readRootEntries(root: string): Dirent[] {
  try {
    return readdirSync(root, { withFileTypes: true });
  } catch {
    throw new AgentInitError(`Cannot read ${root}.`);
  }
}

function monorepoRootError(tool: MonorepoTool): AgentInitError {
  return new AgentInitError(
    `This directory is a monorepo root (${tool}). Run inside a single package.`,
    { exitCode: ERROR },
  );
}

function markerFiles(registry: Registry): string[] {
  const seen = new Set<string>();
  const files: string[] = [];
  for (const fragment of registry.fragments) {
    const meta = fragment.meta;
    if (meta.category === 'workflow') continue;
    const detected = meta.detect?.files;
    if (detected === undefined) continue;
    for (const file of detected) {
      if (seen.has(file)) continue;
      seen.add(file);
      files.push(file);
    }
  }
  return files;
}

/**
 * Versions that could not be resolved are omitted. `ProjectProfile.packages`
 * is `Record<string, string>`. The nulls were already given to `suggestFragments`.
 */
function knownVersions(versions: Readonly<Record<string, string | null>>): Record<string, string> {
  const packages: Record<string, string> = {};
  for (const [name, version] of Object.entries(versions)) {
    if (version !== null) packages[name] = version;
  }
  return packages;
}

function frameworksForRouters(frameworks: readonly string[], routers: NextRouters): string[] {
  return frameworks.filter((id) => {
    if (NEXT_APP_ROUTERS.has(id)) return routers.app;
    if (id === NEXT_PAGES_ROUTER) return routers.pages;
    return true;
  });
}

function tsconfigWarnings(tsconfig: TsConfigSettings | null): DetectionWarning[] {
  if (tsconfig === null) return [];
  return tsconfig.warnings.map((message) => ({
    kind: 'unresolved-tsconfig-extends',
    message,
  }));
}

function legacyWarnings(root: string): DetectionWarning[] {
  return findLegacyFiles(root).map((file) => ({
    kind: 'legacy-agent-file',
    path: file,
  }));
}

function gitLocation(root: string): { gitRoot: string | null; belowGitRoot: boolean } {
  const gitRoot = findGitRoot(root);
  return {
    gitRoot,
    belowGitRoot: gitRoot !== null && gitRoot !== root,
  };
}

/** Empty `name` fields are treated as missing so the summary title stays generic. */
function packageName(pkgJson: PackageJson): string | null {
  const name = pkgJson.name?.trim();
  return name === undefined || name.length === 0 ? null : name;
}
