import { db } from '../db';
import { usersTable, skillsTable, userSkillsTable, skillProofsTable, jobListingsTable, jobApplicationsTable } from '../db/schema';
import { type MarketplaceWorker, type MarketplaceFilter, type JobListing, type CreateJobListingInput, type JobApplication, type ApplyForJobInput } from '../schema';
import { eq, and, gte, ilike, isNotNull, desc, count, SQL } from 'drizzle-orm';

export async function getMarketplaceWorkers(filter: MarketplaceFilter): Promise<MarketplaceWorker[]> {
  try {
    // Build conditions array
    const conditions: SQL<unknown>[] = [
      eq(userSkillsTable.is_verified, true),
      isNotNull(userSkillsTable.verification_date)
    ];

    if (filter.skill_id !== undefined) {
      conditions.push(eq(skillsTable.id, filter.skill_id));
    }

    if (filter.location) {
      conditions.push(ilike(usersTable.location, `%${filter.location}%`));
    }

    if (filter.min_rating !== undefined) {
      conditions.push(gte(usersTable.rating, filter.min_rating.toString()));
    }

    if (filter.search_query) {
      conditions.push(ilike(usersTable.full_name, `%${filter.search_query}%`));
    }

    // Base query with joins and all conditions applied
    let query = db.select({
      id: usersTable.id,
      full_name: usersTable.full_name,
      profile_photo: usersTable.profile_photo,
      location: usersTable.location,
      rating: usersTable.rating,
      bio: usersTable.bio
    })
    .from(usersTable)
    .innerJoin(userSkillsTable, eq(usersTable.id, userSkillsTable.user_id))
    .innerJoin(skillsTable, eq(userSkillsTable.skill_id, skillsTable.id))
    .where(and(...conditions))
    .orderBy(desc(usersTable.rating))
    .limit(filter.limit || 20)
    .offset(filter.offset || 0);

    const results = await query.execute();

    // Get unique users (since we might have multiple skills per user)
    const uniqueUsers = new Map();
    for (const result of results) {
      if (!uniqueUsers.has(result.id)) {
        uniqueUsers.set(result.id, {
          ...result,
          rating: result.rating ? parseFloat(result.rating) : null
        });
      }
    }

    // Get verified skills and portfolio count for each user
    const workers: MarketplaceWorker[] = [];
    for (const user of uniqueUsers.values()) {
      // Get verified skills
      const verifiedSkills = await db.select({
        skill_name: skillsTable.name,
        category: skillsTable.category,
        verification_date: userSkillsTable.verification_date
      })
      .from(userSkillsTable)
      .innerJoin(skillsTable, eq(userSkillsTable.skill_id, skillsTable.id))
      .where(
        and(
          eq(userSkillsTable.user_id, user.id),
          eq(userSkillsTable.is_verified, true),
          isNotNull(userSkillsTable.verification_date)
        )
      )
      .execute();

      // Get portfolio count (skill proofs count)
      const portfolioResult = await db.select({ count: count() })
        .from(skillProofsTable)
        .innerJoin(userSkillsTable, eq(skillProofsTable.user_skill_id, userSkillsTable.id))
        .where(eq(userSkillsTable.user_id, user.id))
        .execute();

      workers.push({
        id: user.id,
        full_name: user.full_name,
        profile_photo: user.profile_photo,
        location: user.location,
        rating: user.rating,
        verified_skills: verifiedSkills.map(skill => ({
          skill_name: skill.skill_name,
          category: skill.category,
          verification_date: skill.verification_date!
        })),
        portfolio_count: portfolioResult[0]?.count || 0
      });
    }

    return workers;
  } catch (error) {
    console.error('Get marketplace workers failed:', error);
    throw error;
  }
}

export async function getWorkerProfile(workerId: number): Promise<MarketplaceWorker & { bio: string; contact_info: string }> {
  try {
    // Get user details
    const userResult = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, workerId))
      .execute();

    if (userResult.length === 0) {
      throw new Error('Worker not found');
    }

    const user = userResult[0];

    // Get verified skills
    const verifiedSkills = await db.select({
      skill_name: skillsTable.name,
      category: skillsTable.category,
      verification_date: userSkillsTable.verification_date
    })
    .from(userSkillsTable)
    .innerJoin(skillsTable, eq(userSkillsTable.skill_id, skillsTable.id))
    .where(
      and(
        eq(userSkillsTable.user_id, workerId),
        eq(userSkillsTable.is_verified, true),
        isNotNull(userSkillsTable.verification_date)
      )
    )
    .execute();

    // Get portfolio count
    const portfolioResult = await db.select({ count: count() })
      .from(skillProofsTable)
      .innerJoin(userSkillsTable, eq(skillProofsTable.user_skill_id, userSkillsTable.id))
      .where(eq(userSkillsTable.user_id, workerId))
      .execute();

    return {
      id: user.id,
      full_name: user.full_name,
      profile_photo: user.profile_photo,
      location: user.location,
      rating: user.rating ? parseFloat(user.rating) : null,
      verified_skills: verifiedSkills.map(skill => ({
        skill_name: skill.skill_name,
        category: skill.category,
        verification_date: skill.verification_date!
      })),
      portfolio_count: portfolioResult[0]?.count || 0,
      bio: user.bio || '',
      contact_info: user.email
    };
  } catch (error) {
    console.error('Get worker profile failed:', error);
    throw error;
  }
}

export async function createJobListing(employerId: number, input: CreateJobListingInput): Promise<JobListing> {
  try {
    // Verify employer exists
    const employerResult = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, employerId))
      .execute();

    if (employerResult.length === 0) {
      throw new Error('Employer not found');
    }

    // Verify skill exists
    const skillResult = await db.select({ id: skillsTable.id })
      .from(skillsTable)
      .where(eq(skillsTable.id, input.skill_id))
      .execute();

    if (skillResult.length === 0) {
      throw new Error('Skill not found');
    }

    // Create job listing
    const result = await db.insert(jobListingsTable)
      .values({
        employer_id: employerId,
        title: input.title,
        description: input.description,
        skill_id: input.skill_id,
        location: input.location,
        salary_range: input.salary_range,
        employment_type: input.employment_type
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Create job listing failed:', error);
    throw error;
  }
}

export async function getJobListings(skillId?: number, location?: string): Promise<JobListing[]> {
  try {
    // Build conditions array
    const conditions: SQL<unknown>[] = [eq(jobListingsTable.is_active, true)];

    if (skillId !== undefined) {
      conditions.push(eq(jobListingsTable.skill_id, skillId));
    }

    if (location) {
      conditions.push(ilike(jobListingsTable.location, `%${location}%`));
    }

    // Apply all conditions and ordering in one query
    const query = db.select()
      .from(jobListingsTable)
      .where(and(...conditions))
      .orderBy(desc(jobListingsTable.created_at));

    const results = await query.execute();
    return results;
  } catch (error) {
    console.error('Get job listings failed:', error);
    throw error;
  }
}

export async function applyForJob(applicantId: number, input: ApplyForJobInput): Promise<JobApplication> {
  try {
    // Verify applicant exists
    const applicantResult = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, applicantId))
      .execute();

    if (applicantResult.length === 0) {
      throw new Error('Applicant not found');
    }

    // Verify job listing exists and is active
    const jobResult = await db.select({ id: jobListingsTable.id, employer_id: jobListingsTable.employer_id })
      .from(jobListingsTable)
      .where(
        and(
          eq(jobListingsTable.id, input.job_listing_id),
          eq(jobListingsTable.is_active, true)
        )
      )
      .execute();

    if (jobResult.length === 0) {
      throw new Error('Job listing not found or inactive');
    }

    // Check if user already applied for this job
    const existingApplication = await db.select({ id: jobApplicationsTable.id })
      .from(jobApplicationsTable)
      .where(
        and(
          eq(jobApplicationsTable.job_listing_id, input.job_listing_id),
          eq(jobApplicationsTable.applicant_id, applicantId)
        )
      )
      .execute();

    if (existingApplication.length > 0) {
      throw new Error('Already applied for this job');
    }

    // Create job application
    const result = await db.insert(jobApplicationsTable)
      .values({
        job_listing_id: input.job_listing_id,
        applicant_id: applicantId,
        message: input.message
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Apply for job failed:', error);
    throw error;
  }
}

export async function getJobApplications(userId: number, isEmployer: boolean): Promise<JobApplication[]> {
  try {
    let query;

    if (isEmployer) {
      // Get applications for jobs posted by this employer
      query = db.select({
        id: jobApplicationsTable.id,
        job_listing_id: jobApplicationsTable.job_listing_id,
        applicant_id: jobApplicationsTable.applicant_id,
        status: jobApplicationsTable.status,
        message: jobApplicationsTable.message,
        applied_at: jobApplicationsTable.applied_at,
        updated_at: jobApplicationsTable.updated_at
      })
      .from(jobApplicationsTable)
      .innerJoin(jobListingsTable, eq(jobApplicationsTable.job_listing_id, jobListingsTable.id))
      .where(eq(jobListingsTable.employer_id, userId));
    } else {
      // Get applications submitted by this user
      query = db.select()
        .from(jobApplicationsTable)
        .where(eq(jobApplicationsTable.applicant_id, userId));
    }

    query = query.orderBy(desc(jobApplicationsTable.applied_at));

    const results = await query.execute();

    if (isEmployer) {
      // For employer queries, map the nested structure
      return results.map(result => ({
        id: result.id,
        job_listing_id: result.job_listing_id,
        applicant_id: result.applicant_id,
        status: result.status,
        message: result.message,
        applied_at: result.applied_at,
        updated_at: result.updated_at
      }));
    } else {
      return results;
    }
  } catch (error) {
    console.error('Get job applications failed:', error);
    throw error;
  }
}