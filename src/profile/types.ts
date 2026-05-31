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
  nickname: z.string().optional(),
  last4: z.string().optional(),
  network: z.string().optional(),
});

export const BrokerSchema = z.object({
  institutionId: z.string(),
  name: z.string(),
  taxSection: z.string().nullable().optional(),
});

export const InsurerSchema = z.object({
  institutionId: z.string().optional(),
  name: z.string(),
  kind: z.string(),
  taxSection: z.string().nullable().optional(),
});

export const LoanSchema = z.object({
  institutionId: z.string().optional(),
  kind: z.string(),
  emiAmount: z.number().nonnegative().optional(),
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
  startDate: isoDate,
  endDate: isoDate,
  categoryHints: z.array(z.string()).default([]),
});

export const ProfileSeedSchema = z.object({
  personal: PersonSchema,
  spouse: PersonSchema.optional(),
  employer: EmployerSchema.optional(),
  home: HomeSchema.optional(),
  banks: z.array(BankSchema).default([]),
  cards: z.array(CardSchema).default([]),
  brokers: z.array(BrokerSchema).default([]),
  insurers: z.array(InsurerSchema).default([]),
  loans: z.array(LoanSchema).default([]),
  houseHelp: z.array(HouseHelpSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
});

export type ProfileSeed = z.infer<typeof ProfileSeedSchema>;
