import { serial, text, pgTable, timestamp, boolean, integer, numeric, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Define enums
export const fileTypeEnum = pgEnum('file_type', ['image', 'video']);
export const uploadStatusEnum = pgEnum('upload_status', ['uploading', 'uploaded', 'processing', 'verified', 'rejected']);
export const questionTypeEnum = pgEnum('question_type', ['multiple_choice', 'video_task', 'true_false']);
export const employmentTypeEnum = pgEnum('employment_type', ['full_time', 'part_time', 'contract', 'freelance']);
export const applicationStatusEnum = pgEnum('application_status', ['pending', 'viewed', 'contacted', 'hired', 'rejected']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  full_name: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  password_hash: text('password_hash').notNull(),
  profile_photo: text('profile_photo'),
  location: text('location'),
  bio: text('bio'),
  rating: numeric('rating', { precision: 3, scale: 2 }), // 0.00 to 5.00
  is_verified: boolean('is_verified').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Skills table
export const skillsTable = pgTable('skills', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  icon: text('icon'),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// User skills junction table
export const userSkillsTable = pgTable('user_skills', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => usersTable.id).notNull(),
  skill_id: integer('skill_id').references(() => skillsTable.id).notNull(),
  is_verified: boolean('is_verified').default(false).notNull(),
  verification_date: timestamp('verification_date'),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Skill proofs table
export const skillProofsTable = pgTable('skill_proofs', {
  id: serial('id').primaryKey(),
  user_skill_id: integer('user_skill_id').references(() => userSkillsTable.id).notNull(),
  file_url: text('file_url').notNull(),
  file_type: fileTypeEnum('file_type').notNull(),
  description: text('description'),
  upload_status: uploadStatusEnum('upload_status').default('uploaded').notNull(),
  ai_verification_score: numeric('ai_verification_score', { precision: 5, scale: 2 }),
  ai_feedback: text('ai_feedback'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Mini tests table
export const miniTestsTable = pgTable('mini_tests', {
  id: serial('id').primaryKey(),
  skill_id: integer('skill_id').references(() => skillsTable.id).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  time_limit: integer('time_limit'), // in minutes
  passing_score: integer('passing_score').notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Test questions table
export const testQuestionsTable = pgTable('test_questions', {
  id: serial('id').primaryKey(),
  test_id: integer('test_id').references(() => miniTestsTable.id).notNull(),
  question_text: text('question_text').notNull(),
  question_type: questionTypeEnum('question_type').notNull(),
  options: text('options'), // JSON string for multiple choice options
  correct_answer: text('correct_answer').notNull(),
  points: integer('points').notNull(),
  order_index: integer('order_index').notNull()
});

// Test attempts table
export const testAttemptsTable = pgTable('test_attempts', {
  id: serial('id').primaryKey(),
  user_skill_id: integer('user_skill_id').references(() => userSkillsTable.id).notNull(),
  test_id: integer('test_id').references(() => miniTestsTable.id).notNull(),
  score: integer('score').notNull(),
  total_points: integer('total_points').notNull(),
  passed: boolean('passed').notNull(),
  started_at: timestamp('started_at').defaultNow().notNull(),
  completed_at: timestamp('completed_at'),
  answers: text('answers').notNull() // JSON string of answers
});

// Certificates table
export const certificatesTable = pgTable('certificates', {
  id: serial('id').primaryKey(),
  user_skill_id: integer('user_skill_id').references(() => userSkillsTable.id).notNull(),
  certificate_number: text('certificate_number').notNull().unique(),
  qr_code: text('qr_code').notNull(),
  issued_date: timestamp('issued_date').defaultNow().notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Job listings table
export const jobListingsTable = pgTable('job_listings', {
  id: serial('id').primaryKey(),
  employer_id: integer('employer_id').references(() => usersTable.id).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  skill_id: integer('skill_id').references(() => skillsTable.id).notNull(),
  location: text('location'),
  salary_range: text('salary_range'),
  employment_type: employmentTypeEnum('employment_type').notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Job applications table
export const jobApplicationsTable = pgTable('job_applications', {
  id: serial('id').primaryKey(),
  job_listing_id: integer('job_listing_id').references(() => jobListingsTable.id).notNull(),
  applicant_id: integer('applicant_id').references(() => usersTable.id).notNull(),
  status: applicationStatusEnum('status').default('pending').notNull(),
  message: text('message'),
  applied_at: timestamp('applied_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Define relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  userSkills: many(userSkillsTable),
  jobListings: many(jobListingsTable),
  jobApplications: many(jobApplicationsTable)
}));

export const skillsRelations = relations(skillsTable, ({ many }) => ({
  userSkills: many(userSkillsTable),
  miniTests: many(miniTestsTable),
  jobListings: many(jobListingsTable)
}));

export const userSkillsRelations = relations(userSkillsTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [userSkillsTable.user_id],
    references: [usersTable.id]
  }),
  skill: one(skillsTable, {
    fields: [userSkillsTable.skill_id],
    references: [skillsTable.id]
  }),
  skillProofs: many(skillProofsTable),
  testAttempts: many(testAttemptsTable),
  certificates: many(certificatesTable)
}));

export const skillProofsRelations = relations(skillProofsTable, ({ one }) => ({
  userSkill: one(userSkillsTable, {
    fields: [skillProofsTable.user_skill_id],
    references: [userSkillsTable.id]
  })
}));

export const miniTestsRelations = relations(miniTestsTable, ({ one, many }) => ({
  skill: one(skillsTable, {
    fields: [miniTestsTable.skill_id],
    references: [skillsTable.id]
  }),
  questions: many(testQuestionsTable),
  attempts: many(testAttemptsTable)
}));

export const testQuestionsRelations = relations(testQuestionsTable, ({ one }) => ({
  test: one(miniTestsTable, {
    fields: [testQuestionsTable.test_id],
    references: [miniTestsTable.id]
  })
}));

export const testAttemptsRelations = relations(testAttemptsTable, ({ one }) => ({
  userSkill: one(userSkillsTable, {
    fields: [testAttemptsTable.user_skill_id],
    references: [userSkillsTable.id]
  }),
  test: one(miniTestsTable, {
    fields: [testAttemptsTable.test_id],
    references: [miniTestsTable.id]
  })
}));

export const certificatesRelations = relations(certificatesTable, ({ one }) => ({
  userSkill: one(userSkillsTable, {
    fields: [certificatesTable.user_skill_id],
    references: [userSkillsTable.id]
  })
}));

export const jobListingsRelations = relations(jobListingsTable, ({ one, many }) => ({
  employer: one(usersTable, {
    fields: [jobListingsTable.employer_id],
    references: [usersTable.id]
  }),
  skill: one(skillsTable, {
    fields: [jobListingsTable.skill_id],
    references: [skillsTable.id]
  }),
  applications: many(jobApplicationsTable)
}));

export const jobApplicationsRelations = relations(jobApplicationsTable, ({ one }) => ({
  jobListing: one(jobListingsTable, {
    fields: [jobApplicationsTable.job_listing_id],
    references: [jobListingsTable.id]
  }),
  applicant: one(usersTable, {
    fields: [jobApplicationsTable.applicant_id],
    references: [usersTable.id]
  })
}));

// Export all tables for proper query building
export const tables = {
  users: usersTable,
  skills: skillsTable,
  userSkills: userSkillsTable,
  skillProofs: skillProofsTable,
  miniTests: miniTestsTable,
  testQuestions: testQuestionsTable,
  testAttempts: testAttemptsTable,
  certificates: certificatesTable,
  jobListings: jobListingsTable,
  jobApplications: jobApplicationsTable
};

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type Skill = typeof skillsTable.$inferSelect;
export type NewSkill = typeof skillsTable.$inferInsert;
export type UserSkill = typeof userSkillsTable.$inferSelect;
export type NewUserSkill = typeof userSkillsTable.$inferInsert;
export type SkillProof = typeof skillProofsTable.$inferSelect;
export type NewSkillProof = typeof skillProofsTable.$inferInsert;
export type MiniTest = typeof miniTestsTable.$inferSelect;
export type NewMiniTest = typeof miniTestsTable.$inferInsert;
export type TestQuestion = typeof testQuestionsTable.$inferSelect;
export type NewTestQuestion = typeof testQuestionsTable.$inferInsert;
export type TestAttempt = typeof testAttemptsTable.$inferSelect;
export type NewTestAttempt = typeof testAttemptsTable.$inferInsert;
export type Certificate = typeof certificatesTable.$inferSelect;
export type NewCertificate = typeof certificatesTable.$inferInsert;
export type JobListing = typeof jobListingsTable.$inferSelect;
export type NewJobListing = typeof jobListingsTable.$inferInsert;
export type JobApplication = typeof jobApplicationsTable.$inferSelect;
export type NewJobApplication = typeof jobApplicationsTable.$inferInsert;