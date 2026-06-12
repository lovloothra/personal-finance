/**
 * Profile seed schema.
 *
 * The user fills secrets/profile.local.json (gitignored) with their household
 * details. Amounts are in whole RUPEES for human friendliness; the loader
 * converts to paise for the DB and classifier. This single document feeds:
 *   - the classifier context (employer/rent/house-help/loan/broker/insurer/projects)
 *   - the Gmail query builder (which institutions to search)
 *   - PDF password candidates (DOB / PAN / mobile / last4 / customer id)
 */
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const PersonSchema = z.object({
  fullName: z.string().min(1),
  dob: isoDate.optional(),
  pan: z.string().optional(),
  mobile: z.string().optional(),
  city: z.string().optional(),
  email: z.string().optional(),
});

export const DependentSchema = z.object({
  relation: z.string().min(1),
  fullName: z.string().min(1),
  dob: isoDate.optional(),
  pan: z.string().optional(),
  mobile: z.string().optional(),
  isDependent: z.boolean().default(true),
  hasIncome: z.boolean().default(false),
});

export const EmployerSchema = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  monthlyNetSalary: z.number().nonnegative().optional(),
});

export const HomeSchema = z.object({
  ownership: z.enum(['owned', 'rented', 'family']).optional(),
  monthlyRent: z.number().nonnegative().optional(),
  landlordName: z.string().optional(),
  cityTier: z.enum(['metro', 'non_metro']).optional(),
  hraInSalary: z.number().nonnegative().optional(),
});

export const BankSchema = z.object({
  institutionId: z.string(),
  nickname: z.string().optional(),
  last4: z.string().optional(),
  customerId: z.string().optional(),
  accountType: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

export const CardSchema = z.object({
  institutionId: z.string(),
  /** Specific card product from the pack (e.g. hdfc-infinia). */
  productId: z.string().optional(),
  nickname: z.string().optional(),
  last4: z.string().optional(),
  network: z.string().optional(),
  creditLimit: z.number().nonnegative().optional(),
  statementDay: z.number().int().min(1).max(31).optional(),
});

export const BrokerSchema = z.object({
  institutionId: z.string(),
  name: z.string(),
  taxSection: z.string().nullable().optional(),
});

export const InvestmentPlatformSchema = z.object({
  institutionId: z.string(),
  name: z.string(),
  kind: z.string().optional(),
  taxSection: z.string().nullable().optional(),
});

export const InsurerSchema = z.object({
  institutionId: z.string().optional(),
  name: z.string(),
  kind: z.string(),
  taxSection: z.string().nullable().optional(),
  policyNumberLast4: z.string().optional(),
  premium: z.number().nonnegative().optional(),
  cadence: z.string().optional(),
  sumAssured: z.number().nonnegative().optional(),
  renewalMonth: z.number().int().min(1).max(12).optional(),
  coversSelf: z.boolean().optional(),
  coversParents: z.boolean().optional(),
});

export const LoanSchema = z.object({
  institutionId: z.string().optional(),
  kind: z.string(),
  principal: z.number().nonnegative().optional(),
  outstanding: z.number().nonnegative().optional(),
  emiAmount: z.number().nonnegative().optional(),
  emiDay: z.number().int().min(1).max(31).optional(),
  interestRate: z.number().nonnegative().optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
});

export const HouseHelpSchema = z.object({
  name: z.string(),
  role: z.string(),
  monthlyAmount: z.number().nonnegative().optional(),
  upiHandle: z.string().optional(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  budget: z.number().nonnegative().optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  status: z.string().optional(),
  categoryHints: z.array(z.string()).default([]),
});

export const SubscriptionSchema = z.object({
  name: z.string(),
  amount: z.number().nonnegative().optional(),
  cadence: z.string().optional(),
  category: z.string().optional(),
});

export const AnnualExpenseSchema = z.object({
  name: z.string(),
  amount: z.number().nonnegative().optional(),
  month: z.number().int().min(1).max(12).optional(),
  category: z.string().optional(),
});

export const GoalsSchema = z.object({
  savingsRateTarget: z.number().nonnegative().optional(),
  retirementAge: z.number().int().nonnegative().optional(),
  retirementCorpus: z.number().nonnegative().optional(),
  emergencyFundMonths: z.number().nonnegative().optional(),
  monthlyInvestmentTarget: z.number().nonnegative().optional(),
}).default({});

export const TaxSetupSchema = z.object({
  regimePreference: z.enum(['old', 'new', 'compare']).optional(),
  annual80C: z.number().nonnegative().optional(),
  annual80D: z.number().nonnegative().optional(),
  nps80CCD1B: z.number().nonnegative().optional(),
  employerNps80CCD2: z.number().nonnegative().optional(),
  homeLoanInterest: z.number().nonnegative().optional(),
}).default({});

export const OnboardingProgressSchema = z.object({
  completedChapters: z.array(z.string()).default([]),
  skippedChapters: z.array(z.string()).default([]),
  xp: z.number().nonnegative().default(0),
  level: z.number().int().positive().default(1),
  lastChapter: z.string().optional(),
}).default({ completedChapters: [], skippedChapters: [], xp: 0, level: 1 });

export const ProfileSeedSchema = z.object({
  personal: PersonSchema,
  spouse: PersonSchema.optional(),
  dependents: z.array(DependentSchema).default([]),
  employer: EmployerSchema.optional(),
  home: HomeSchema.optional(),
  banks: z.array(BankSchema).default([]),
  cards: z.array(CardSchema).default([]),
  brokers: z.array(BrokerSchema).default([]),
  investmentPlatforms: z.array(InvestmentPlatformSchema).default([]),
  insurers: z.array(InsurerSchema).default([]),
  loans: z.array(LoanSchema).default([]),
  houseHelp: z.array(HouseHelpSchema).default([]),
  subscriptions: z.array(SubscriptionSchema).default([]),
  annualExpenses: z.array(AnnualExpenseSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  goals: GoalsSchema,
  tax: TaxSetupSchema,
  onboarding: OnboardingProgressSchema,
});

export type ProfileSeed = z.infer<typeof ProfileSeedSchema>;
