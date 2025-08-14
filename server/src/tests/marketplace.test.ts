import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, skillsTable, userSkillsTable, skillProofsTable, jobListingsTable, jobApplicationsTable } from '../db/schema';
import { 
  getMarketplaceWorkers, 
  getWorkerProfile, 
  createJobListing, 
  getJobListings, 
  applyForJob, 
  getJobApplications 
} from '../handlers/marketplace';
import { type MarketplaceFilter, type CreateJobListingInput, type ApplyForJobInput } from '../schema';
// Test data
const testEmployer = {
  full_name: 'John Employer',
  email: 'employer@test.com',
  phone: '+1234567890',
  password_hash: 'hashed_password_123'
};

const testWorker = {
  full_name: 'Jane Worker',
  email: 'worker@test.com',
  phone: '+1234567891',
  password_hash: 'hashed_password_456',
  location: 'Jakarta',
  bio: 'Experienced worker with great skills',
  rating: '4.5'
};

const testSkill = {
  name: 'Welding',
  category: 'Technical',
  description: 'Metal welding skills'
};

const testJobInput: CreateJobListingInput = {
  title: 'Senior Welder Position',
  description: 'Looking for an experienced welder for construction projects',
  skill_id: 1, // Will be updated with actual skill ID
  location: 'Jakarta',
  salary_range: '$3000-$4000',
  employment_type: 'full_time'
};

const testApplicationInput: ApplyForJobInput = {
  job_listing_id: 1, // Will be updated with actual job ID
  message: 'I am very interested in this position'
};

describe('Marketplace Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getMarketplaceWorkers', () => {
    it('should return verified workers', async () => {
      // Create test data
      const employerResult = await db.insert(usersTable).values(testEmployer).returning().execute();
      const workerResult = await db.insert(usersTable).values(testWorker).returning().execute();
      const skillResult = await db.insert(skillsTable).values(testSkill).returning().execute();

      const employerId = employerResult[0].id;
      const workerId = workerResult[0].id;
      const skillId = skillResult[0].id;

      // Create user skill (verified)
      const userSkillResult = await db.insert(userSkillsTable).values({
        user_id: workerId,
        skill_id: skillId,
        is_verified: true,
        verification_date: new Date()
      }).returning().execute();

      // Create skill proof for portfolio count
      await db.insert(skillProofsTable).values({
        user_skill_id: userSkillResult[0].id,
        file_url: 'https://example.com/proof.jpg',
        file_type: 'image',
        description: 'Welding certificate'
      }).execute();

      const filter: MarketplaceFilter = {};
      const workers = await getMarketplaceWorkers(filter);

      expect(workers).toHaveLength(1);
      expect(workers[0].id).toEqual(workerId);
      expect(workers[0].full_name).toEqual('Jane Worker');
      expect(workers[0].location).toEqual('Jakarta');
      expect(workers[0].rating).toEqual(4.5);
      expect(workers[0].verified_skills).toHaveLength(1);
      expect(workers[0].verified_skills[0].skill_name).toEqual('Welding');
      expect(workers[0].portfolio_count).toEqual(1);
    });

    it('should filter workers by skill', async () => {
      // Create test data
      const workerResult = await db.insert(usersTable).values(testWorker).returning().execute();
      const skillResult = await db.insert(skillsTable).values(testSkill).returning().execute();
      const otherSkillResult = await db.insert(skillsTable).values({
        name: 'Plumbing',
        category: 'Technical',
        description: 'Plumbing skills'
      }).returning().execute();

      const workerId = workerResult[0].id;
      const skillId = skillResult[0].id;
      const otherSkillId = otherSkillResult[0].id;

      // Create verified skill
      await db.insert(userSkillsTable).values({
        user_id: workerId,
        skill_id: skillId,
        is_verified: true,
        verification_date: new Date()
      }).execute();

      // Create unverified skill
      await db.insert(userSkillsTable).values({
        user_id: workerId,
        skill_id: otherSkillId,
        is_verified: false
      }).execute();

      const filter: MarketplaceFilter = { skill_id: skillId };
      const workers = await getMarketplaceWorkers(filter);

      expect(workers).toHaveLength(1);
      expect(workers[0].verified_skills).toHaveLength(1);
      expect(workers[0].verified_skills[0].skill_name).toEqual('Welding');
    });

    it('should filter workers by location', async () => {
      // Create test data
      const workerResult = await db.insert(usersTable).values(testWorker).returning().execute();
      const skillResult = await db.insert(skillsTable).values(testSkill).returning().execute();

      const workerId = workerResult[0].id;
      const skillId = skillResult[0].id;

      // Create verified skill
      await db.insert(userSkillsTable).values({
        user_id: workerId,
        skill_id: skillId,
        is_verified: true,
        verification_date: new Date()
      }).execute();

      const filter: MarketplaceFilter = { location: 'Jakarta' };
      const workers = await getMarketplaceWorkers(filter);

      expect(workers).toHaveLength(1);
      expect(workers[0].location).toEqual('Jakarta');

      // Test with non-matching location
      const noMatchFilter: MarketplaceFilter = { location: 'Bandung' };
      const noWorkers = await getMarketplaceWorkers(noMatchFilter);
      expect(noWorkers).toHaveLength(0);
    });

    it('should filter workers by minimum rating', async () => {
      // Create test data
      const workerResult = await db.insert(usersTable).values(testWorker).returning().execute();
      const skillResult = await db.insert(skillsTable).values(testSkill).returning().execute();

      const workerId = workerResult[0].id;
      const skillId = skillResult[0].id;

      // Create verified skill
      await db.insert(userSkillsTable).values({
        user_id: workerId,
        skill_id: skillId,
        is_verified: true,
        verification_date: new Date()
      }).execute();

      const filter: MarketplaceFilter = { min_rating: 4.0 };
      const workers = await getMarketplaceWorkers(filter);

      expect(workers).toHaveLength(1);
      expect(workers[0].rating).toBeGreaterThanOrEqual(4.0);

      // Test with higher minimum rating
      const highRatingFilter: MarketplaceFilter = { min_rating: 5.0 };
      const noWorkers = await getMarketplaceWorkers(highRatingFilter);
      expect(noWorkers).toHaveLength(0);
    });

    it('should handle pagination', async () => {
      // Create test data
      const workerResult = await db.insert(usersTable).values(testWorker).returning().execute();
      const skillResult = await db.insert(skillsTable).values(testSkill).returning().execute();

      const workerId = workerResult[0].id;
      const skillId = skillResult[0].id;

      // Create verified skill
      await db.insert(userSkillsTable).values({
        user_id: workerId,
        skill_id: skillId,
        is_verified: true,
        verification_date: new Date()
      }).execute();

      const filter: MarketplaceFilter = { limit: 5, offset: 0 };
      const workers = await getMarketplaceWorkers(filter);

      expect(workers).toHaveLength(1);
    });
  });

  describe('getWorkerProfile', () => {
    it('should return detailed worker profile', async () => {
      // Create test data
      const workerResult = await db.insert(usersTable).values(testWorker).returning().execute();
      const skillResult = await db.insert(skillsTable).values(testSkill).returning().execute();

      const workerId = workerResult[0].id;
      const skillId = skillResult[0].id;

      // Create verified skill
      const userSkillResult = await db.insert(userSkillsTable).values({
        user_id: workerId,
        skill_id: skillId,
        is_verified: true,
        verification_date: new Date()
      }).returning().execute();

      // Create skill proof
      await db.insert(skillProofsTable).values({
        user_skill_id: userSkillResult[0].id,
        file_url: 'https://example.com/proof.jpg',
        file_type: 'image'
      }).execute();

      const profile = await getWorkerProfile(workerId);

      expect(profile.id).toEqual(workerId);
      expect(profile.full_name).toEqual('Jane Worker');
      expect(profile.bio).toEqual('Experienced worker with great skills');
      expect(profile.contact_info).toEqual('worker@test.com');
      expect(profile.rating).toEqual(4.5);
      expect(profile.verified_skills).toHaveLength(1);
      expect(profile.portfolio_count).toEqual(1);
    });

    it('should throw error for non-existent worker', async () => {
      await expect(getWorkerProfile(999)).rejects.toThrow(/Worker not found/i);
    });
  });

  describe('createJobListing', () => {
    it('should create job listing successfully', async () => {
      // Create test data
      const employerResult = await db.insert(usersTable).values(testEmployer).returning().execute();
      const skillResult = await db.insert(skillsTable).values(testSkill).returning().execute();

      const employerId = employerResult[0].id;
      const skillId = skillResult[0].id;

      const jobInput: CreateJobListingInput = {
        ...testJobInput,
        skill_id: skillId
      };

      const jobListing = await createJobListing(employerId, jobInput);

      expect(jobListing.id).toBeDefined();
      expect(jobListing.employer_id).toEqual(employerId);
      expect(jobListing.title).toEqual(jobInput.title);
      expect(jobListing.description).toEqual(jobInput.description);
      expect(jobListing.skill_id).toEqual(skillId);
      expect(jobListing.location).toEqual(jobInput.location);
      expect(jobListing.salary_range).toEqual(jobInput.salary_range);
      expect(jobListing.employment_type).toEqual(jobInput.employment_type);
      expect(jobListing.is_active).toEqual(true);
      expect(jobListing.created_at).toBeInstanceOf(Date);
      expect(jobListing.updated_at).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent employer', async () => {
      const skillResult = await db.insert(skillsTable).values(testSkill).returning().execute();
      const skillId = skillResult[0].id;

      const jobInput: CreateJobListingInput = {
        ...testJobInput,
        skill_id: skillId
      };

      await expect(createJobListing(999, jobInput)).rejects.toThrow(/Employer not found/i);
    });

    it('should throw error for non-existent skill', async () => {
      const employerResult = await db.insert(usersTable).values(testEmployer).returning().execute();
      const employerId = employerResult[0].id;

      await expect(createJobListing(employerId, testJobInput)).rejects.toThrow(/Skill not found/i);
    });
  });

  describe('getJobListings', () => {
    it('should return active job listings', async () => {
      // Create test data
      const employerResult = await db.insert(usersTable).values(testEmployer).returning().execute();
      const skillResult = await db.insert(skillsTable).values(testSkill).returning().execute();

      const employerId = employerResult[0].id;
      const skillId = skillResult[0].id;

      // Create active job listing
      await db.insert(jobListingsTable).values({
        employer_id: employerId,
        title: 'Active Job',
        description: 'This is an active job',
        skill_id: skillId,
        employment_type: 'full_time',
        is_active: true
      }).execute();

      // Create inactive job listing
      await db.insert(jobListingsTable).values({
        employer_id: employerId,
        title: 'Inactive Job',
        description: 'This is an inactive job',
        skill_id: skillId,
        employment_type: 'part_time',
        is_active: false
      }).execute();

      const jobListings = await getJobListings();

      expect(jobListings).toHaveLength(1);
      expect(jobListings[0].title).toEqual('Active Job');
      expect(jobListings[0].is_active).toEqual(true);
    });

    it('should filter job listings by skill', async () => {
      // Create test data
      const employerResult = await db.insert(usersTable).values(testEmployer).returning().execute();
      const skillResult = await db.insert(skillsTable).values(testSkill).returning().execute();
      const otherSkillResult = await db.insert(skillsTable).values({
        name: 'Plumbing',
        category: 'Technical'
      }).returning().execute();

      const employerId = employerResult[0].id;
      const skillId = skillResult[0].id;
      const otherSkillId = otherSkillResult[0].id;

      // Create jobs for different skills
      await db.insert(jobListingsTable).values({
        employer_id: employerId,
        title: 'Welding Job',
        description: 'Welding position',
        skill_id: skillId,
        employment_type: 'full_time'
      }).execute();

      await db.insert(jobListingsTable).values({
        employer_id: employerId,
        title: 'Plumbing Job',
        description: 'Plumbing position',
        skill_id: otherSkillId,
        employment_type: 'full_time'
      }).execute();

      const jobListings = await getJobListings(skillId);

      expect(jobListings).toHaveLength(1);
      expect(jobListings[0].title).toEqual('Welding Job');
    });

    it('should filter job listings by location', async () => {
      // Create test data
      const employerResult = await db.insert(usersTable).values(testEmployer).returning().execute();
      const skillResult = await db.insert(skillsTable).values(testSkill).returning().execute();

      const employerId = employerResult[0].id;
      const skillId = skillResult[0].id;

      // Create jobs in different locations
      await db.insert(jobListingsTable).values({
        employer_id: employerId,
        title: 'Jakarta Job',
        description: 'Job in Jakarta',
        skill_id: skillId,
        location: 'Jakarta',
        employment_type: 'full_time'
      }).execute();

      await db.insert(jobListingsTable).values({
        employer_id: employerId,
        title: 'Bandung Job',
        description: 'Job in Bandung',
        skill_id: skillId,
        location: 'Bandung',
        employment_type: 'full_time'
      }).execute();

      const jobListings = await getJobListings(undefined, 'Jakarta');

      expect(jobListings).toHaveLength(1);
      expect(jobListings[0].title).toEqual('Jakarta Job');
    });
  });

  describe('applyForJob', () => {
    it('should create job application successfully', async () => {
      // Create test data
      const employerResult = await db.insert(usersTable).values(testEmployer).returning().execute();
      const workerResult = await db.insert(usersTable).values(testWorker).returning().execute();
      const skillResult = await db.insert(skillsTable).values(testSkill).returning().execute();

      const employerId = employerResult[0].id;
      const workerId = workerResult[0].id;
      const skillId = skillResult[0].id;

      // Create job listing
      const jobResult = await db.insert(jobListingsTable).values({
        employer_id: employerId,
        title: 'Test Job',
        description: 'A test job',
        skill_id: skillId,
        employment_type: 'full_time'
      }).returning().execute();

      const jobId = jobResult[0].id;

      const applicationInput: ApplyForJobInput = {
        job_listing_id: jobId,
        message: 'I am interested in this position'
      };

      const application = await applyForJob(workerId, applicationInput);

      expect(application.id).toBeDefined();
      expect(application.job_listing_id).toEqual(jobId);
      expect(application.applicant_id).toEqual(workerId);
      expect(application.status).toEqual('pending');
      expect(application.message).toEqual(applicationInput.message);
      expect(application.applied_at).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent applicant', async () => {
      const employerResult = await db.insert(usersTable).values(testEmployer).returning().execute();
      const skillResult = await db.insert(skillsTable).values(testSkill).returning().execute();

      const employerId = employerResult[0].id;
      const skillId = skillResult[0].id;

      // Create job listing
      const jobResult = await db.insert(jobListingsTable).values({
        employer_id: employerId,
        title: 'Test Job',
        description: 'A test job',
        skill_id: skillId,
        employment_type: 'full_time'
      }).returning().execute();

      const applicationInput: ApplyForJobInput = {
        job_listing_id: jobResult[0].id,
        message: 'Test message'
      };

      await expect(applyForJob(999, applicationInput)).rejects.toThrow(/Applicant not found/i);
    });

    it('should throw error for non-existent or inactive job', async () => {
      const workerResult = await db.insert(usersTable).values(testWorker).returning().execute();
      const workerId = workerResult[0].id;

      const applicationInput: ApplyForJobInput = {
        job_listing_id: 999,
        message: 'Test message'
      };

      await expect(applyForJob(workerId, applicationInput)).rejects.toThrow(/Job listing not found/i);
    });

    it('should throw error for duplicate application', async () => {
      // Create test data
      const employerResult = await db.insert(usersTable).values(testEmployer).returning().execute();
      const workerResult = await db.insert(usersTable).values(testWorker).returning().execute();
      const skillResult = await db.insert(skillsTable).values(testSkill).returning().execute();

      const employerId = employerResult[0].id;
      const workerId = workerResult[0].id;
      const skillId = skillResult[0].id;

      // Create job listing
      const jobResult = await db.insert(jobListingsTable).values({
        employer_id: employerId,
        title: 'Test Job',
        description: 'A test job',
        skill_id: skillId,
        employment_type: 'full_time'
      }).returning().execute();

      const jobId = jobResult[0].id;

      const applicationInput: ApplyForJobInput = {
        job_listing_id: jobId,
        message: 'First application'
      };

      // First application should succeed
      await applyForJob(workerId, applicationInput);

      // Second application should fail
      await expect(applyForJob(workerId, applicationInput)).rejects.toThrow(/Already applied for this job/i);
    });
  });

  describe('getJobApplications', () => {
    it('should return applications for employer', async () => {
      // Create test data
      const employerResult = await db.insert(usersTable).values(testEmployer).returning().execute();
      const workerResult = await db.insert(usersTable).values(testWorker).returning().execute();
      const skillResult = await db.insert(skillsTable).values(testSkill).returning().execute();

      const employerId = employerResult[0].id;
      const workerId = workerResult[0].id;
      const skillId = skillResult[0].id;

      // Create job listing
      const jobResult = await db.insert(jobListingsTable).values({
        employer_id: employerId,
        title: 'Test Job',
        description: 'A test job',
        skill_id: skillId,
        employment_type: 'full_time'
      }).returning().execute();

      // Create job application
      await db.insert(jobApplicationsTable).values({
        job_listing_id: jobResult[0].id,
        applicant_id: workerId,
        message: 'Test application'
      }).execute();

      const applications = await getJobApplications(employerId, true);

      expect(applications).toHaveLength(1);
      expect(applications[0].applicant_id).toEqual(workerId);
      expect(applications[0].message).toEqual('Test application');
    });

    it('should return applications for worker', async () => {
      // Create test data
      const employerResult = await db.insert(usersTable).values(testEmployer).returning().execute();
      const workerResult = await db.insert(usersTable).values(testWorker).returning().execute();
      const skillResult = await db.insert(skillsTable).values(testSkill).returning().execute();

      const employerId = employerResult[0].id;
      const workerId = workerResult[0].id;
      const skillId = skillResult[0].id;

      // Create job listing
      const jobResult = await db.insert(jobListingsTable).values({
        employer_id: employerId,
        title: 'Test Job',
        description: 'A test job',
        skill_id: skillId,
        employment_type: 'full_time'
      }).returning().execute();

      // Create job application
      await db.insert(jobApplicationsTable).values({
        job_listing_id: jobResult[0].id,
        applicant_id: workerId,
        message: 'Test application'
      }).execute();

      const applications = await getJobApplications(workerId, false);

      expect(applications).toHaveLength(1);
      expect(applications[0].applicant_id).toEqual(workerId);
      expect(applications[0].message).toEqual('Test application');
    });
  });
});