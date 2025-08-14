import { db } from '../db';
import { skillsTable, userSkillsTable, usersTable } from '../db/schema';
import { type Skill, type CreateSkillInput, type AddUserSkillInput, type UserSkill } from '../schema';
import { eq, and, ilike, or } from 'drizzle-orm';
import { SQL } from 'drizzle-orm';

export async function getSkills(): Promise<Skill[]> {
  try {
    const results = await db.select()
      .from(skillsTable)
      .where(eq(skillsTable.is_active, true))
      .orderBy(skillsTable.category, skillsTable.name)
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch skills:', error);
    throw error;
  }
}

export async function searchSkills(query: string): Promise<Skill[]> {
  try {
    if (!query.trim()) {
      return [];
    }

    const searchTerm = `%${query.trim()}%`;
    
    const results = await db.select()
      .from(skillsTable)
      .where(
        and(
          eq(skillsTable.is_active, true),
          or(
            ilike(skillsTable.name, searchTerm),
            ilike(skillsTable.category, searchTerm),
            ilike(skillsTable.description, searchTerm)
          )
        )
      )
      .orderBy(skillsTable.name)
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to search skills:', error);
    throw error;
  }
}

export async function createSkill(input: CreateSkillInput): Promise<Skill> {
  try {
    const results = await db.insert(skillsTable)
      .values({
        name: input.name,
        category: input.category,
        description: input.description,
        icon: input.icon
      })
      .returning()
      .execute();

    return results[0];
  } catch (error) {
    console.error('Failed to create skill:', error);
    throw error;
  }
}

export async function addUserSkill(userId: number, input: AddUserSkillInput): Promise<UserSkill> {
  try {
    // First verify that both user and skill exist
    const userExists = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (userExists.length === 0) {
      throw new Error(`User with id ${userId} not found`);
    }

    const skillExists = await db.select({ id: skillsTable.id })
      .from(skillsTable)
      .where(eq(skillsTable.id, input.skill_id))
      .execute();

    if (skillExists.length === 0) {
      throw new Error(`Skill with id ${input.skill_id} not found`);
    }

    // Check if user already has this skill
    const existingUserSkill = await db.select()
      .from(userSkillsTable)
      .where(
        and(
          eq(userSkillsTable.user_id, userId),
          eq(userSkillsTable.skill_id, input.skill_id)
        )
      )
      .execute();

    if (existingUserSkill.length > 0) {
      throw new Error('User already has this skill');
    }

    const results = await db.insert(userSkillsTable)
      .values({
        user_id: userId,
        skill_id: input.skill_id
      })
      .returning()
      .execute();

    return results[0];
  } catch (error) {
    console.error('Failed to add user skill:', error);
    throw error;
  }
}

export async function getUserSkills(userId: number): Promise<UserSkill[]> {
  try {
    // Verify user exists
    const userExists = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (userExists.length === 0) {
      throw new Error(`User with id ${userId} not found`);
    }

    const results = await db.select()
      .from(userSkillsTable)
      .where(eq(userSkillsTable.user_id, userId))
      .orderBy(userSkillsTable.created_at)
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch user skills:', error);
    throw error;
  }
}