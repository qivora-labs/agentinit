import { valid, validRange } from 'semver';
import * as z from 'zod';
import type { FragmentCategory, FragmentScope } from '../types.js';

const RULE_CATEGORIES = [
  'architecture',
  'language',
  'framework',
  'library',
] as const satisfies readonly Exclude<FragmentCategory, 'workflow'>[];

const SCOPES = ['always', 'glob', 'auto', 'manual'] as const satisfies readonly FragmentScope[];

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Placeholders from PRD §4.4. They contain braces but are not brace expansion.
 * Any `{` or `}` left after removing these is rejected.
 */
const GLOB_PLACEHOLDER = /\{\{(?:src|pm|scripts\.[^{}]+)\}\}/g;

const idSchema = z.string().regex(KEBAB_CASE, { error: 'must be kebab-case' });

const singleLineSchema = z.string().superRefine((value, ctx) => {
  if (value.trim().length === 0) {
    ctx.addIssue({ code: 'custom', message: 'must not be empty' });
    return;
  }
  if (/[\r\n]/.test(value)) {
    ctx.addIssue({ code: 'custom', message: 'must be a single line' });
  }
});

const semverVersionSchema = z.string().refine((value) => valid(value) !== null, {
  error: 'must be valid semver',
});

// semver.validRange('') returns '*', so an empty string has to be rejected first.
const semverRangeSchema = z.string().refine((value) => {
  const trimmed = value.trim();
  return trimmed.length > 0 && validRange(trimmed) !== null;
}, { error: 'must be a valid semver range' });

function globProblem(glob: string): string | undefined {
  if (glob.trim().length === 0) {
    return 'must not be empty';
  }
  if (/[\r\n]/.test(glob)) {
    return 'must be a single line';
  }
  if (glob.includes('\\')) {
    return 'backslashes are not allowed';
  }
  if (glob.startsWith('/') || glob.startsWith('./')) {
    return 'must not start with / or ./';
  }
  const withoutPlaceholders = glob.replace(GLOB_PLACEHOLDER, '');
  if (withoutPlaceholders.includes('{') || withoutPlaceholders.includes('}')) {
    return 'brace patterns are not allowed';
  }
  // Cursor, Windsurf, and Copilot join patterns with commas.
  if (glob.includes(',')) {
    return 'commas are not allowed';
  }
  return undefined;
}

const globSchema = z.string().superRefine((glob, ctx) => {
  const problem = globProblem(glob);
  if (problem !== undefined) {
    ctx.addIssue({ code: 'custom', message: problem });
  }
});

const nonEmptyStrings = z
  .array(z.string().min(1, { error: 'must not be empty' }))
  .min(1, { error: 'must list at least one entry' });

/**
 * Detection is a conjunction: every listed package and every listed file must
 * be present. An empty list would match everything, so it is rejected.
 */
const detectSchema = z
  .object({
    packages: nonEmptyStrings.optional(),
    files: nonEmptyStrings.optional(),
  })
  .strict()
  .superRefine((detect, ctx) => {
    if (detect.packages === undefined && detect.files === undefined) {
      ctx.addIssue({ code: 'custom', message: 'must list packages or files' });
    }
  });

const appliesToSchema = z
  .record(z.string().min(1, { error: 'must not be empty' }), semverRangeSchema)
  .refine((record) => Object.keys(record).length > 0, {
    error: 'must list at least one package',
  });

const idListSchema = z.array(idSchema).min(1, { error: 'must list at least one id' });

const commonFields = {
  id: idSchema,
  name: singleLineSchema,
  version: semverVersionSchema,
  order: z.int({ error: 'must be an integer' }),
  description: singleLineSchema,
  sources: z
    .array(z.url({ error: 'must be a URL' }))
    .min(1, { error: 'at least one source is required' }),
  verifiedAt: z.iso.date({ error: 'must be YYYY-MM-DD' }),
};

const ruleFragmentSchema = z
  .object({
    ...commonFields,
    category: z.enum(RULE_CATEGORIES),
    scope: z.enum(SCOPES),
    globs: z.array(globSchema).optional(),
    detect: detectSchema.optional(),
    appliesTo: appliesToSchema.optional(),
    requires: idListSchema.optional(),
    conflictsWith: idListSchema.optional(),
    compatibleWith: idListSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scope === 'always') {
      if (value.globs !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['globs'],
          message: 'forbidden when scope is always',
        });
      }
      return;
    }
    if (
      (value.scope === 'glob' || value.scope === 'auto') &&
      (value.globs === undefined || value.globs.length === 0)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['globs'],
        message: 'required when scope is glob or auto',
      });
      return;
    }
    if (value.globs?.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['globs'],
        message: 'must not be empty',
      });
    }
  });

const workflowFragmentSchema = z
  .object({
    ...commonFields,
    category: z.literal('workflow'),
    argumentHint: singleLineSchema.optional(),
  })
  .strict();

export const fragmentMetaSchema = z.discriminatedUnion('category', [
  ruleFragmentSchema,
  workflowFragmentSchema,
]);

export type RuleFragmentMeta = z.infer<typeof ruleFragmentSchema>;
export type WorkflowFragmentMeta = z.infer<typeof workflowFragmentSchema>;
export type FragmentMeta = z.infer<typeof fragmentMetaSchema>;

export interface Fragment {
  meta: FragmentMeta;
  body: string;
  sourcePath: string;
}
