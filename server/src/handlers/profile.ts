import { db } from '../db';
import { usersTable, userSkillsTable, skillsTable, skillProofsTable, certificatesTable } from '../db/schema';
import { type User, type UpdateProfileInput } from '../schema';
import { eq, count, sql } from 'drizzle-orm';

export async function updateUserProfile(userId: number, input: UpdateProfileInput): Promise<User> {
  try {
    // Check if user exists
    const existingUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (existingUser.length === 0) {
      throw new Error('User not found');
    }

    // Build update object with only provided fields
    const updateData: Record<string, any> = {
      updated_at: new Date()
    };

    if (input.full_name !== undefined) {
      updateData['full_name'] = input.full_name;
    }
    if (input.phone !== undefined) {
      updateData['phone'] = input.phone;
    }
    if (input.profile_photo !== undefined) {
      updateData['profile_photo'] = input.profile_photo;
    }
    if (input.location !== undefined) {
      updateData['location'] = input.location;
    }
    if (input.bio !== undefined) {
      updateData['bio'] = input.bio;
    }

    // Update user profile
    const result = await db.update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, userId))
      .returning()
      .execute();

    const user = result[0];
    return {
      ...user,
      rating: user.rating ? parseFloat(user.rating) : null
    };
  } catch (error) {
    console.error('Profile update failed:', error);
    throw error;
  }
}

export async function uploadProfilePhoto(userId: number, fileUrl: string): Promise<User> {
  try {
    // Check if user exists
    const existingUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (existingUser.length === 0) {
      throw new Error('User not found');
    }

    // Update profile photo
    const result = await db.update(usersTable)
      .set({
        profile_photo: fileUrl,
        updated_at: new Date()
      })
      .where(eq(usersTable.id, userId))
      .returning()
      .execute();

    const user = result[0];
    return {
      ...user,
      rating: user.rating ? parseFloat(user.rating) : null
    };
  } catch (error) {
    console.error('Profile photo upload failed:', error);
    throw error;
  }
}

export async function getUserPortfolio(userId: number): Promise<{
  user: User;
  skills: Array<{
    skill_name: string;
    category: string;
    is_verified: boolean;
    proof_count: number;
    certificate_url?: string;
  }>;
  total_certificates: number;
}> {
  try {
    // Get user information
    const userResult = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (userResult.length === 0) {
      throw new Error('User not found');
    }

    const user = {
      ...userResult[0],
      rating: userResult[0].rating ? parseFloat(userResult[0].rating) : null
    };

    // Get user skills with proof counts and certificates
    const skillsQuery = await db.select({
      skill_name: skillsTable.name,
      category: skillsTable.category,
      is_verified: userSkillsTable.is_verified,
      user_skill_id: userSkillsTable.id
    })
    .from(userSkillsTable)
    .innerJoin(skillsTable, eq(userSkillsTable.skill_id, skillsTable.id))
    .where(eq(userSkillsTable.user_id, userId))
    .execute();

    // Get proof counts for each user skill
    const skills = [];
    for (const skill of skillsQuery) {
      // Count proofs for this user skill
      const proofCountResult = await db.select({ 
        count: count() 
      })
      .from(skillProofsTable)
      .where(eq(skillProofsTable.user_skill_id, skill.user_skill_id))
      .execute();

      const proof_count = proofCountResult[0]?.count || 0;

      // Get certificate if exists
      const certificateResult = await db.select({
        qr_code: certificatesTable.qr_code
      })
      .from(certificatesTable)
      .where(eq(certificatesTable.user_skill_id, skill.user_skill_id))
      .execute();

      const certificate_url = certificateResult.length > 0 ? certificateResult[0].qr_code : undefined;

      skills.push({
        skill_name: skill.skill_name,
        category: skill.category,
        is_verified: skill.is_verified,
        proof_count: typeof proof_count === 'number' ? proof_count : 0,
        certificate_url
      });
    }

    // Get total certificates count
    const totalCertificatesResult = await db.select({ 
      count: count() 
    })
    .from(certificatesTable)
    .innerJoin(userSkillsTable, eq(certificatesTable.user_skill_id, userSkillsTable.id))
    .where(eq(userSkillsTable.user_id, userId))
    .execute();

    const total_certificates = totalCertificatesResult[0]?.count || 0;

    return {
      user,
      skills,
      total_certificates: typeof total_certificates === 'number' ? total_certificates : 0
    };
  } catch (error) {
    console.error('Get user portfolio failed:', error);
    throw error;
  }
}