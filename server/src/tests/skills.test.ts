import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { skillsTable, usersTable, userSkillsTable } from '../db/schema';
import { type CreateSkillInput, type AddUserSkillInput } from '../schema';
import { getSkills, searchSkills, createSkill, addUserSkill, getUserSkills } from '../handlers/skills';
import { eq, and } from 'drizzle-orm';

describe('Skills Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getSkills', () => {
    it('should return all active skills ordered by category and name', async () => {
      // Create test skills
      await db.insert(skillsTable).values([
        {
          name: 'Welding',
          category: 'Technical',
          description: 'Metal welding skills',
          icon: 'welding.png',
          is_active: true
        },
        {
          name: 'AC Service',
          category: 'Technical',
          description: 'AC repair skills',
          icon: 'ac.png',
          is_active: true
        },
        {
          name: 'Plumbing',
          category: 'Construction',
          description: 'Plumbing skills',
          icon: 'plumb.png',
          is_active: true
        },
        {
          name: 'Inactive Skill',
          category: 'Test',
          description: 'Should not appear',
          icon: null,
          is_active: false
        }
      ]).execute();

      const result = await getSkills();

      // Should return only active skills
      expect(result).toHaveLength(3);
      
      // Verify ordering by category then name
      expect(result[0].name).toBe('Plumbing'); // Construction comes first
      expect(result[0].category).toBe('Construction');
      expect(result[1].name).toBe('AC Service'); // Technical category, alphabetically first
      expect(result[1].category).toBe('Technical');
      expect(result[2].name).toBe('Welding'); // Technical category, alphabetically second
      expect(result[2].category).toBe('Technical');

      // Verify fields are properly mapped
      expect(result[0].description).toBe('Plumbing skills');
      expect(result[0].is_active).toBe(true);
      expect(result[0].created_at).toBeInstanceOf(Date);
      expect(result[0].id).toBeDefined();
    });

    it('should return empty array when no active skills exist', async () => {
      const result = await getSkills();
      expect(result).toHaveLength(0);
    });
  });

  describe('searchSkills', () => {
    beforeEach(async () => {
      // Create test skills for searching
      await db.insert(skillsTable).values([
        {
          name: 'Welding',
          category: 'Technical',
          description: 'Metal welding and fabrication',
          icon: 'welding.png',
          is_active: true
        },
        {
          name: 'AC Service',
          category: 'Technical',
          description: 'Air conditioning repair',
          icon: 'ac.png',
          is_active: true
        },
        {
          name: 'Electrical Work',
          category: 'Technical',
          description: 'House wiring and electrical systems',
          icon: 'electric.png',
          is_active: true
        },
        {
          name: 'Carpentry',
          category: 'Construction',
          description: 'Wood working and furniture',
          icon: 'wood.png',
          is_active: true
        },
        {
          name: 'Plumbing',
          category: 'Construction',
          description: 'Water systems and pipes',
          icon: 'plumb.png',
          is_active: false // Inactive skill
        }
      ]).execute();
    });

    it('should find skills by name (case insensitive)', async () => {
      const result = await searchSkills('welding');
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Welding');
      expect(result[0].category).toBe('Technical');
    });

    it('should find skills by category (case insensitive)', async () => {
      const result = await searchSkills('technical');
      
      expect(result).toHaveLength(3);
      expect(result.every(skill => skill.category === 'Technical')).toBe(true);
    });

    it('should find skills by description (case insensitive)', async () => {
      const result = await searchSkills('repair');
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('AC Service');
    });

    it('should return results ordered by name', async () => {
      const result = await searchSkills('tech');
      
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('AC Service');
      expect(result[1].name).toBe('Electrical Work');
      expect(result[2].name).toBe('Welding');
    });

    it('should return empty array for empty query', async () => {
      const result = await searchSkills('');
      expect(result).toHaveLength(0);
    });

    it('should return empty array for whitespace-only query', async () => {
      const result = await searchSkills('   ');
      expect(result).toHaveLength(0);
    });

    it('should return empty array when no matches found', async () => {
      const result = await searchSkills('nonexistent');
      expect(result).toHaveLength(0);
    });

    it('should not return inactive skills', async () => {
      const result = await searchSkills('plumb');
      expect(result).toHaveLength(0);
    });
  });

  describe('createSkill', () => {
    const testInput: CreateSkillInput = {
      name: 'Test Skill',
      category: 'Testing',
      description: 'A skill for testing',
      icon: 'test.png'
    };

    it('should create a skill with all fields', async () => {
      const result = await createSkill(testInput);

      expect(result.name).toBe('Test Skill');
      expect(result.category).toBe('Testing');
      expect(result.description).toBe('A skill for testing');
      expect(result.icon).toBe('test.png');
      expect(result.is_active).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should create a skill with nullable fields set to null', async () => {
      const inputWithNulls: CreateSkillInput = {
        name: 'Minimal Skill',
        category: 'Testing',
        description: null,
        icon: null
      };

      const result = await createSkill(inputWithNulls);

      expect(result.name).toBe('Minimal Skill');
      expect(result.category).toBe('Testing');
      expect(result.description).toBeNull();
      expect(result.icon).toBeNull();
      expect(result.is_active).toBe(true);
    });

    it('should save skill to database', async () => {
      const result = await createSkill(testInput);

      const skills = await db.select()
        .from(skillsTable)
        .where(eq(skillsTable.id, result.id))
        .execute();

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('Test Skill');
      expect(skills[0].is_active).toBe(true);
    });
  });

  describe('addUserSkill', () => {
    let userId: number;
    let skillId: number;
    let testInput: AddUserSkillInput;

    beforeEach(async () => {
      // Create test user
      const userResult = await db.insert(usersTable).values({
        full_name: 'Test User',
        email: 'test@example.com',
        password_hash: 'hashed_password'
      }).returning().execute();
      userId = userResult[0].id;

      // Create test skill
      const skillResult = await db.insert(skillsTable).values({
        name: 'Test Skill',
        category: 'Testing',
        description: 'A test skill',
        icon: 'test.png'
      }).returning().execute();
      skillId = skillResult[0].id;

      testInput = { skill_id: skillId };
    });

    it('should add skill to user successfully', async () => {
      const result = await addUserSkill(userId, testInput);

      expect(result.user_id).toBe(userId);
      expect(result.skill_id).toBe(skillId);
      expect(result.is_verified).toBe(false);
      expect(result.verification_date).toBeNull();
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should save user skill to database', async () => {
      const result = await addUserSkill(userId, testInput);

      const userSkills = await db.select()
        .from(userSkillsTable)
        .where(eq(userSkillsTable.id, result.id))
        .execute();

      expect(userSkills).toHaveLength(1);
      expect(userSkills[0].user_id).toBe(userId);
      expect(userSkills[0].skill_id).toBe(skillId);
    });

    it('should throw error when user does not exist', async () => {
      expect(addUserSkill(99999, testInput)).rejects.toThrow(/user.*not found/i);
    });

    it('should throw error when skill does not exist', async () => {
      const invalidInput: AddUserSkillInput = { skill_id: 99999 };
      expect(addUserSkill(userId, invalidInput)).rejects.toThrow(/skill.*not found/i);
    });

    it('should throw error when user already has the skill', async () => {
      // Add skill first time
      await addUserSkill(userId, testInput);
      
      // Try to add same skill again
      expect(addUserSkill(userId, testInput)).rejects.toThrow(/already has this skill/i);
    });
  });

  describe('getUserSkills', () => {
    let userId: number;
    let skillId1: number;
    let skillId2: number;

    beforeEach(async () => {
      // Create test user
      const userResult = await db.insert(usersTable).values({
        full_name: 'Test User',
        email: 'test@example.com',
        password_hash: 'hashed_password'
      }).returning().execute();
      userId = userResult[0].id;

      // Create test skills
      const skillResults = await db.insert(skillsTable).values([
        {
          name: 'Skill 1',
          category: 'Testing',
          description: 'First test skill',
          icon: 'skill1.png'
        },
        {
          name: 'Skill 2',
          category: 'Testing',
          description: 'Second test skill',
          icon: 'skill2.png'
        }
      ]).returning().execute();
      
      skillId1 = skillResults[0].id;
      skillId2 = skillResults[1].id;
    });

    it('should return all user skills ordered by creation date', async () => {
      // Add skills to user
      await db.insert(userSkillsTable).values([
        { user_id: userId, skill_id: skillId1 },
        { user_id: userId, skill_id: skillId2, is_verified: true }
      ]).execute();

      const result = await getUserSkills(userId);

      expect(result).toHaveLength(2);
      expect(result[0].skill_id).toBe(skillId1);
      expect(result[0].is_verified).toBe(false);
      expect(result[1].skill_id).toBe(skillId2);
      expect(result[1].is_verified).toBe(true);
      
      // Verify ordering by creation date
      expect(result[0].created_at <= result[1].created_at).toBe(true);
    });

    it('should return empty array when user has no skills', async () => {
      const result = await getUserSkills(userId);
      expect(result).toHaveLength(0);
    });

    it('should throw error when user does not exist', async () => {
      expect(getUserSkills(99999)).rejects.toThrow(/user.*not found/i);
    });

    it('should return skills with correct field types', async () => {
      await db.insert(userSkillsTable).values({
        user_id: userId,
        skill_id: skillId1,
        is_verified: true,
        verification_date: new Date()
      }).execute();

      const result = await getUserSkills(userId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBeDefined();
      expect(result[0].user_id).toBe(userId);
      expect(result[0].skill_id).toBe(skillId1);
      expect(result[0].is_verified).toBe(true);
      expect(result[0].verification_date).toBeInstanceOf(Date);
      expect(result[0].created_at).toBeInstanceOf(Date);
    });
  });
});