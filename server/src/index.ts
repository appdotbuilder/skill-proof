import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  registerInputSchema,
  loginInputSchema,
  updateProfileInputSchema,
  createSkillInputSchema,
  addUserSkillInputSchema,
  uploadProofInputSchema,
  startTestInputSchema,
  submitTestInputSchema,
  createJobListingInputSchema,
  applyForJobInputSchema,
  marketplaceFilterSchema
} from './schema';

// Import handlers
import { registerUser, loginUser, getUserProfile } from './handlers/auth';
import { getSkills, searchSkills, createSkill, addUserSkill, getUserSkills } from './handlers/skills';
import { uploadSkillProof, getSkillProofs, processAIVerification, getProofUploadStatus } from './handlers/proofs';
import { getTestsForSkill, getTestQuestions, startTest, submitTest, getUserTestAttempts } from './handlers/tests';
import { generateCertificate, getUserCertificates, verifyCertificate, downloadCertificate } from './handlers/certificates';
import { getMarketplaceWorkers, getWorkerProfile, createJobListing, getJobListings, applyForJob, getJobApplications } from './handlers/marketplace';
import { updateUserProfile, uploadProfilePhoto, getUserPortfolio } from './handlers/profile';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

// Create context type for authenticated requests
type Context = {
  userId?: number;
};

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  register: publicProcedure
    .input(registerInputSchema)
    .mutation(({ input }) => registerUser(input)),

  login: publicProcedure
    .input(loginInputSchema)
    .mutation(({ input }) => loginUser(input)),

  getUserProfile: publicProcedure
    .input(z.number())
    .query(({ input }) => getUserProfile(input)),

  // Profile management routes
  updateProfile: publicProcedure
    .input(z.object({ userId: z.number() }).merge(updateProfileInputSchema))
    .mutation(({ input }) => updateUserProfile(input.userId, input)),

  uploadProfilePhoto: publicProcedure
    .input(z.object({ userId: z.number(), fileUrl: z.string() }))
    .mutation(({ input }) => uploadProfilePhoto(input.userId, input.fileUrl)),

  getUserPortfolio: publicProcedure
    .input(z.number())
    .query(({ input }) => getUserPortfolio(input)),

  // Skills routes
  getSkills: publicProcedure
    .query(() => getSkills()),

  searchSkills: publicProcedure
    .input(z.string())
    .query(({ input }) => searchSkills(input)),

  createSkill: publicProcedure
    .input(createSkillInputSchema)
    .mutation(({ input }) => createSkill(input)),

  addUserSkill: publicProcedure
    .input(z.object({ userId: z.number() }).merge(addUserSkillInputSchema))
    .mutation(({ input }) => addUserSkill(input.userId, input)),

  getUserSkills: publicProcedure
    .input(z.number())
    .query(({ input }) => getUserSkills(input)),

  // Skill proofs routes
  uploadSkillProof: publicProcedure
    .input(z.object({ userId: z.number() }).merge(uploadProofInputSchema))
    .mutation(({ input }) => uploadSkillProof(input.userId, input)),

  getSkillProofs: publicProcedure
    .input(z.number())
    .query(({ input }) => getSkillProofs(input)),

  processAIVerification: publicProcedure
    .input(z.number())
    .mutation(({ input }) => processAIVerification(input)),

  getProofUploadStatus: publicProcedure
    .input(z.number())
    .query(({ input }) => getProofUploadStatus(input)),

  // Tests routes
  getTestsForSkill: publicProcedure
    .input(z.number())
    .query(({ input }) => getTestsForSkill(input)),

  getTestQuestions: publicProcedure
    .input(z.number())
    .query(({ input }) => getTestQuestions(input)),

  startTest: publicProcedure
    .input(z.object({ userId: z.number() }).merge(startTestInputSchema))
    .mutation(({ input }) => startTest(input.userId, input)),

  submitTest: publicProcedure
    .input(z.object({ userId: z.number() }).merge(submitTestInputSchema))
    .mutation(({ input }) => submitTest(input.userId, input)),

  getUserTestAttempts: publicProcedure
    .input(z.object({ userId: z.number(), skillId: z.number().optional() }))
    .query(({ input }) => getUserTestAttempts(input.userId, input.skillId)),

  // Certificates routes
  generateCertificate: publicProcedure
    .input(z.number())
    .mutation(({ input }) => generateCertificate(input)),

  getUserCertificates: publicProcedure
    .input(z.number())
    .query(({ input }) => getUserCertificates(input)),

  verifyCertificate: publicProcedure
    .input(z.string())
    .query(({ input }) => verifyCertificate(input)),

  downloadCertificate: publicProcedure
    .input(z.number())
    .query(({ input }) => downloadCertificate(input)),

  // Marketplace routes
  getMarketplaceWorkers: publicProcedure
    .input(marketplaceFilterSchema)
    .query(({ input }) => getMarketplaceWorkers(input)),

  getWorkerProfile: publicProcedure
    .input(z.number())
    .query(({ input }) => getWorkerProfile(input)),

  createJobListing: publicProcedure
    .input(z.object({ employerId: z.number() }).merge(createJobListingInputSchema))
    .mutation(({ input }) => createJobListing(input.employerId, input)),

  getJobListings: publicProcedure
    .input(z.object({ skillId: z.number().optional(), location: z.string().optional() }))
    .query(({ input }) => getJobListings(input.skillId, input.location)),

  applyForJob: publicProcedure
    .input(z.object({ applicantId: z.number() }).merge(applyForJobInputSchema))
    .mutation(({ input }) => applyForJob(input.applicantId, input)),

  getJobApplications: publicProcedure
    .input(z.object({ userId: z.number(), isEmployer: z.boolean() }))
    .query(({ input }) => getJobApplications(input.userId, input.isEmployer)),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext(): Context {
      // In a real implementation, this would extract user info from JWT token
      // For now, return empty context - handlers expect userId as input parameter
      return {};
    },
  });
  server.listen(port);
  console.log(`Skill-Proof TRPC server listening at port: ${port}`);
}

start();