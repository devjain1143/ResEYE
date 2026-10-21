import { z } from 'zod';

const DegreeEnum = z.enum(['B Tech', 'M Tech', 'MCA', 'Ph. D.']);
const SpecializationEnum = z.enum([
  'Artificial Intelligence',
  'Computer Science & Engineering',
  'Cyber Physical System',
  'Cyber Security',
  'Data Science',
  'Information Technology',
  'Electronics & Communication Engineering',
  'Master of Computer Application',
  'Mathematics',
  'Mathematics and Computing',
  'Physics and Computational Engineering'
]);

const MetricEnum = z.enum(['spi', 'cpi']);
const ConfidenceEnum = z.enum(['high', 'low']);

const SemesterSchema = z.number().int().min(1).max(8);
const SafeBatchSchema = z.string().regex(/^[a-zA-Z0-9\s\-_./]+$/, 'Invalid batch identifier').max(64).optional();
const SafeScholarPrefixSchema = z.string().regex(/^[a-zA-Z0-9]+$/, 'Invalid scholar prefix').max(10).optional();

const LookupStudentParams = z.object({
  identifier: z.string().optional(),
  name: z.string().optional(),
  scholar_no: z.string().optional()
}).strict().refine(val => Boolean(val.identifier || val.name || val.scholar_no), {
  message: 'Must provide at least one of identifier, name, or scholar_no'
});

const TopScorerParams = z.object({
  degree: DegreeEnum.optional(),
  specialization: SpecializationEnum.optional(),
  scholar_no_prefix: SafeScholarPrefixSchema,
  batch: SafeBatchSchema,
  metric: MetricEnum,
  semester: SemesterSchema.optional(),
  position: z.enum(['highest', 'lowest']).optional().default('highest'),
  limit: z.number().int().min(1).max(5).optional().default(1)
}).strict().superRefine((val, ctx) => {
  if (val.metric === 'spi' && typeof val.semester !== 'number') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'semester is required when metric is "spi"'
    });
  }
});

const AverageMetricParams = z.object({
  degree: DegreeEnum.optional(),
  specialization: SpecializationEnum.optional(),
  scholar_no_prefix: SafeScholarPrefixSchema,
  batch: SafeBatchSchema,
  metric: MetricEnum,
  semester: SemesterSchema.optional()
}).strict().superRefine((val, ctx) => {
  if (val.metric === 'spi' && typeof val.semester !== 'number') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'semester is required when metric is "spi"'
    });
  }
});

const ResultCountParams = z.object({
  degree: DegreeEnum.optional(),
  specialization: SpecializationEnum.optional(),
  scholar_no_prefix: SafeScholarPrefixSchema,
  batch: SafeBatchSchema,
  semester: SemesterSchema
}).strict();

const BatchRosterParams = z.object({
  degree: DegreeEnum.optional(),
  specialization: SpecializationEnum.optional(),
  scholar_no_prefix: SafeScholarPrefixSchema,
  batch: SafeBatchSchema
}).strict();

const RankParams = z.object({
  identifier: z.string().optional(),
  name: z.string().optional(),
  scholar_no: z.string().optional(),
  degree: DegreeEnum.optional(),
  specialization: SpecializationEnum.optional(),
  scholar_no_prefix: SafeScholarPrefixSchema,
  batch: SafeBatchSchema,
  semester: SemesterSchema.optional(),
  metric: MetricEnum
}).strict().superRefine((val, ctx) => {
  if (val.metric === 'spi' && typeof val.semester !== 'number') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'semester is required when metric is "spi"'
    });
  }
});

const UnsupportedParams = z.object({}).strict();

export const IntentSchema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('LOOKUP_STUDENT'),
    params: LookupStudentParams,
    confidence: ConfidenceEnum
  }).strict(),
  z.object({
    intent: z.literal('TOP_SCORER'),
    params: TopScorerParams,
    confidence: ConfidenceEnum
  }).strict(),
  z.object({
    intent: z.literal('AVERAGE_METRIC'),
    params: AverageMetricParams,
    confidence: ConfidenceEnum
  }).strict(),
  z.object({
    intent: z.literal('RESULT_COUNT'),
    params: ResultCountParams,
    confidence: ConfidenceEnum
  }).strict(),
  z.object({
    intent: z.literal('BATCH_ROSTER'),
    params: BatchRosterParams,
    confidence: ConfidenceEnum
  }).strict(),
  z.object({
    intent: z.literal('RANK'),
    params: RankParams,
    confidence: ConfidenceEnum
  }).strict(),
  z.object({
    intent: z.literal('UNSUPPORTED'),
    params: UnsupportedParams.default({}),
    confidence: ConfidenceEnum
  }).strict()
]);

export function validateIntent(input) {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Payload must be a non-null JSON object' };
  }

  const result = IntentSchema.safeParse(input);
  if (result.success) {
    return { valid: true, data: result.data };
  }

  const issues = result.error.issues || result.error.errors || [];
  const errorMsg = issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
  return { valid: false, error: errorMsg };
}
