import { z } from 'zod';

// User schema
export const userSchema = z.object({
  id: z.number(),
  full_name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  password_hash: z.string(),
  profile_photo: z.string().nullable(),
  location: z.string().nullable(),
  bio: z.string().nullable(),
  rating: z.number().nullable(),
  is_verified: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// Registration input schema
export const registerInputSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email format"),
  phone: z.string().nullable(),
  password: z.string().min(6, "Password must be at least 6 characters")
});

export type RegisterInput = z.infer<typeof registerInputSchema>;

// Login input schema
export const loginInputSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string()
});

export type LoginInput = z.infer<typeof loginInputSchema>;

// Update profile input schema
export const updateProfileInputSchema = z.object({
  full_name: z.string().min(2).optional(),
  phone: z.string().nullable().optional(),
  profile_photo: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  bio: z.string().nullable().optional()
});

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

// Skills schema
export const skillSchema = z.object({
  id: z.number(),
  name: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date()
});

export type Skill = z.infer<typeof skillSchema>;

// Create skill input schema
export const createSkillInputSchema = z.object({
  name: z.string().min(2, "Skill name must be at least 2 characters"),
  category: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable()
});

export type CreateSkillInput = z.infer<typeof createSkillInputSchema>;

// User skills schema (junction table)
export const userSkillSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  skill_id: z.number(),
  is_verified: z.boolean(),
  verification_date: z.coerce.date().nullable(),
  created_at: z.coerce.date()
});

export type UserSkill = z.infer<typeof userSkillSchema>;

// Add user skill input schema
export const addUserSkillInputSchema = z.object({
  skill_id: z.number()
});

export type AddUserSkillInput = z.infer<typeof addUserSkillInputSchema>;

// Skill proof schema
export const skillProofSchema = z.object({
  id: z.number(),
  user_skill_id: z.number(),
  file_url: z.string(),
  file_type: z.enum(['image', 'video']),
  description: z.string().nullable(),
  upload_status: z.enum(['uploading', 'uploaded', 'processing', 'verified', 'rejected']),
  ai_verification_score: z.number().nullable(),
  ai_feedback: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type SkillProof = z.infer<typeof skillProofSchema>;

// Upload proof input schema
export const uploadProofInputSchema = z.object({
  user_skill_id: z.number(),
  file_url: z.string(),
  file_type: z.enum(['image', 'video']),
  description: z.string().nullable()
});

export type UploadProofInput = z.infer<typeof uploadProofInputSchema>;

// Mini test schema
export const miniTestSchema = z.object({
  id: z.number(),
  skill_id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  time_limit: z.number().nullable(), // in minutes
  passing_score: z.number(),
  is_active: z.boolean(),
  created_at: z.coerce.date()
});

export type MiniTest = z.infer<typeof miniTestSchema>;

// Test question schema
export const testQuestionSchema = z.object({
  id: z.number(),
  test_id: z.number(),
  question_text: z.string(),
  question_type: z.enum(['multiple_choice', 'video_task', 'true_false']),
  options: z.array(z.string()).nullable(), // JSON array for multiple choice options
  correct_answer: z.string(),
  points: z.number(),
  order_index: z.number()
});

export type TestQuestion = z.infer<typeof testQuestionSchema>;

// Test attempt schema
export const testAttemptSchema = z.object({
  id: z.number(),
  user_skill_id: z.number(),
  test_id: z.number(),
  score: z.number(),
  total_points: z.number(),
  passed: z.boolean(),
  started_at: z.coerce.date(),
  completed_at: z.coerce.date().nullable(),
  answers: z.string() // JSON string of answers
});

export type TestAttempt = z.infer<typeof testAttemptSchema>;

// Start test input schema
export const startTestInputSchema = z.object({
  user_skill_id: z.number(),
  test_id: z.number()
});

export type StartTestInput = z.infer<typeof startTestInputSchema>;

// Submit test input schema
export const submitTestInputSchema = z.object({
  attempt_id: z.number(),
  answers: z.record(z.string()) // question_id -> answer mapping
});

export type SubmitTestInput = z.infer<typeof submitTestInputSchema>;

// Certificate schema
export const certificateSchema = z.object({
  id: z.number(),
  user_skill_id: z.number(),
  certificate_number: z.string(),
  qr_code: z.string(),
  issued_date: z.coerce.date(),
  is_active: z.boolean(),
  created_at: z.coerce.date()
});

export type Certificate = z.infer<typeof certificateSchema>;

// Job listing schema
export const jobListingSchema = z.object({
  id: z.number(),
  employer_id: z.number(),
  title: z.string(),
  description: z.string(),
  skill_id: z.number(),
  location: z.string().nullable(),
  salary_range: z.string().nullable(),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'freelance']),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type JobListing = z.infer<typeof jobListingSchema>;

// Create job listing input schema
export const createJobListingInputSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  skill_id: z.number(),
  location: z.string().nullable(),
  salary_range: z.string().nullable(),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'freelance'])
});

export type CreateJobListingInput = z.infer<typeof createJobListingInputSchema>;

// Job application schema
export const jobApplicationSchema = z.object({
  id: z.number(),
  job_listing_id: z.number(),
  applicant_id: z.number(),
  status: z.enum(['pending', 'viewed', 'contacted', 'hired', 'rejected']),
  message: z.string().nullable(),
  applied_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type JobApplication = z.infer<typeof jobApplicationSchema>;

// Apply for job input schema
export const applyForJobInputSchema = z.object({
  job_listing_id: z.number(),
  message: z.string().nullable()
});

export type ApplyForJobInput = z.infer<typeof applyForJobInputSchema>;

// Marketplace filter schema
export const marketplaceFilterSchema = z.object({
  skill_id: z.number().optional(),
  location: z.string().optional(),
  min_rating: z.number().min(0).max(5).optional(),
  search_query: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional()
});

export type MarketplaceFilter = z.infer<typeof marketplaceFilterSchema>;

// Worker profile for marketplace
export const marketplaceWorkerSchema = z.object({
  id: z.number(),
  full_name: z.string(),
  profile_photo: z.string().nullable(),
  location: z.string().nullable(),
  rating: z.number().nullable(),
  verified_skills: z.array(z.object({
    skill_name: z.string(),
    category: z.string(),
    verification_date: z.coerce.date()
  })),
  portfolio_count: z.number()
});

export type MarketplaceWorker = z.infer<typeof marketplaceWorkerSchema>;