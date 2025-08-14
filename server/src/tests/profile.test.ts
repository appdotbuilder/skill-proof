import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, skillsTable, userSkillsTable, skillProofsTable, certificatesTable } from '../db/schema';
import { type UpdateProfileInput } from '../schema';
import { updateUserProfile, uploadProfilePhoto, getUserPortfolio } from '../handlers/profile';
import { eq } from 'drizzle-orm';

describe('Profile handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('updateUserProfile', () => {
    it('should update user profile with all fields', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values({
          full_name: 'Original Name',
          email: 'test@example.com',
          password_hash: 'hashed_password',
          phone: '1234567890',
          location: 'Original City',
          bio: 'Original bio'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      const updateInput: UpdateProfileInput = {
        full_name: 'Updated Name',
        phone: '9876543210',
        profile_photo: 'https://example.com/photo.jpg',
        location: 'New City',
        bio: 'Updated bio'
      };

      const result = await updateUserProfile(userId, updateInput);

      expect(result.id).toEqual(userId);
      expect(result.full_name).toEqual('Updated Name');
      expect(result.phone).toEqual('9876543210');
      expect(result.profile_photo).toEqual('https://example.com/photo.jpg');
      expect(result.location).toEqual('New City');
      expect(result.bio).toEqual('Updated bio');
      expect(result.email).toEqual('test@example.com'); // Should remain unchanged
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should update only provided fields', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values({
          full_name: 'Original Name',
          email: 'test@example.com',
          password_hash: 'hashed_password',
          phone: '1234567890',
          location: 'Original City',
          bio: 'Original bio'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      const updateInput: UpdateProfileInput = {
        full_name: 'Updated Name',
        bio: 'Updated bio only'
      };

      const result = await updateUserProfile(userId, updateInput);

      expect(result.full_name).toEqual('Updated Name');
      expect(result.bio).toEqual('Updated bio only');
      expect(result.phone).toEqual('1234567890'); // Should remain unchanged
      expect(result.location).toEqual('Original City'); // Should remain unchanged
    });

    it('should handle nullable fields correctly', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values({
          full_name: 'Test User',
          email: 'test@example.com',
          password_hash: 'hashed_password',
          phone: '1234567890'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      const updateInput: UpdateProfileInput = {
        phone: null,
        profile_photo: null,
        location: null,
        bio: null
      };

      const result = await updateUserProfile(userId, updateInput);

      expect(result.phone).toBeNull();
      expect(result.profile_photo).toBeNull();
      expect(result.location).toBeNull();
      expect(result.bio).toBeNull();
    });

    it('should convert rating to number correctly', async () => {
      // Create test user with rating
      const userResult = await db.insert(usersTable)
        .values({
          full_name: 'Test User',
          email: 'test@example.com',
          password_hash: 'hashed_password',
          rating: '4.50'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      const updateInput: UpdateProfileInput = {
        bio: 'Updated bio'
      };

      const result = await updateUserProfile(userId, updateInput);

      expect(result.rating).toEqual(4.5);
      expect(typeof result.rating).toBe('number');
    });

    it('should throw error for non-existent user', async () => {
      const updateInput: UpdateProfileInput = {
        full_name: 'Updated Name'
      };

      await expect(updateUserProfile(999, updateInput)).rejects.toThrow(/user not found/i);
    });

    it('should update database record', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values({
          full_name: 'Original Name',
          email: 'test@example.com',
          password_hash: 'hashed_password'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      const updateInput: UpdateProfileInput = {
        full_name: 'Database Updated Name',
        location: 'New Location'
      };

      await updateUserProfile(userId, updateInput);

      // Verify database was updated
      const dbUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .execute();

      expect(dbUser[0].full_name).toEqual('Database Updated Name');
      expect(dbUser[0].location).toEqual('New Location');
    });
  });

  describe('uploadProfilePhoto', () => {
    it('should update profile photo', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values({
          full_name: 'Test User',
          email: 'test@example.com',
          password_hash: 'hashed_password'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;
      const fileUrl = 'https://example.com/new-photo.jpg';

      const result = await uploadProfilePhoto(userId, fileUrl);

      expect(result.id).toEqual(userId);
      expect(result.profile_photo).toEqual(fileUrl);
      expect(result.full_name).toEqual('Test User');
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should replace existing profile photo', async () => {
      // Create test user with existing photo
      const userResult = await db.insert(usersTable)
        .values({
          full_name: 'Test User',
          email: 'test@example.com',
          password_hash: 'hashed_password',
          profile_photo: 'https://example.com/old-photo.jpg'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;
      const newFileUrl = 'https://example.com/new-photo.jpg';

      const result = await uploadProfilePhoto(userId, newFileUrl);

      expect(result.profile_photo).toEqual(newFileUrl);
    });

    it('should throw error for non-existent user', async () => {
      await expect(uploadProfilePhoto(999, 'https://example.com/photo.jpg'))
        .rejects.toThrow(/user not found/i);
    });

    it('should update database record', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values({
          full_name: 'Test User',
          email: 'test@example.com',
          password_hash: 'hashed_password'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;
      const fileUrl = 'https://example.com/database-photo.jpg';

      await uploadProfilePhoto(userId, fileUrl);

      // Verify database was updated
      const dbUser = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .execute();

      expect(dbUser[0].profile_photo).toEqual(fileUrl);
    });
  });

  describe('getUserPortfolio', () => {
    it('should return user portfolio with no skills', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values({
          full_name: 'Test User',
          email: 'test@example.com',
          password_hash: 'hashed_password',
          location: 'Test City',
          bio: 'Test bio',
          rating: '4.25'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      const result = await getUserPortfolio(userId);

      expect(result.user.id).toEqual(userId);
      expect(result.user.full_name).toEqual('Test User');
      expect(result.user.rating).toEqual(4.25);
      expect(typeof result.user.rating).toBe('number');
      expect(result.skills).toEqual([]);
      expect(result.total_certificates).toEqual(0);
    });

    it('should return user portfolio with skills and proofs', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values({
          full_name: 'Test User',
          email: 'test@example.com',
          password_hash: 'hashed_password'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      // Create test skills
      const skillResults = await db.insert(skillsTable)
        .values([
          {
            name: 'JavaScript',
            category: 'Programming',
            description: 'Web development language'
          },
          {
            name: 'Design',
            category: 'Creative',
            description: 'UI/UX design'
          }
        ])
        .returning()
        .execute();

      // Create user skills
      const userSkillResults = await db.insert(userSkillsTable)
        .values([
          {
            user_id: userId,
            skill_id: skillResults[0].id,
            is_verified: true,
            verification_date: new Date()
          },
          {
            user_id: userId,
            skill_id: skillResults[1].id,
            is_verified: false
          }
        ])
        .returning()
        .execute();

      // Create skill proofs
      await db.insert(skillProofsTable)
        .values([
          {
            user_skill_id: userSkillResults[0].id,
            file_url: 'https://example.com/proof1.jpg',
            file_type: 'image'
          },
          {
            user_skill_id: userSkillResults[0].id,
            file_url: 'https://example.com/proof2.jpg',
            file_type: 'image'
          },
          {
            user_skill_id: userSkillResults[1].id,
            file_url: 'https://example.com/proof3.jpg',
            file_type: 'image'
          }
        ])
        .execute();

      // Create certificate
      await db.insert(certificatesTable)
        .values({
          user_skill_id: userSkillResults[0].id,
          certificate_number: 'CERT-001',
          qr_code: 'https://example.com/cert-qr.png'
        })
        .execute();

      const result = await getUserPortfolio(userId);

      expect(result.user.id).toEqual(userId);
      expect(result.skills).toHaveLength(2);
      
      const jsSkill = result.skills.find(s => s.skill_name === 'JavaScript');
      expect(jsSkill).toBeDefined();
      expect(jsSkill!.category).toEqual('Programming');
      expect(jsSkill!.is_verified).toBe(true);
      expect(jsSkill!.proof_count).toEqual(2);
      expect(jsSkill!.certificate_url).toEqual('https://example.com/cert-qr.png');

      const designSkill = result.skills.find(s => s.skill_name === 'Design');
      expect(designSkill).toBeDefined();
      expect(designSkill!.category).toEqual('Creative');
      expect(designSkill!.is_verified).toBe(false);
      expect(designSkill!.proof_count).toEqual(1);
      expect(designSkill!.certificate_url).toBeUndefined();

      expect(result.total_certificates).toEqual(1);
    });

    it('should handle user with null rating', async () => {
      // Create test user without rating
      const userResult = await db.insert(usersTable)
        .values({
          full_name: 'Test User',
          email: 'test@example.com',
          password_hash: 'hashed_password',
          rating: null
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      const result = await getUserPortfolio(userId);

      expect(result.user.rating).toBeNull();
    });

    it('should throw error for non-existent user', async () => {
      await expect(getUserPortfolio(999)).rejects.toThrow(/user not found/i);
    });

    it('should handle skills with no proofs or certificates', async () => {
      // Create test user
      const userResult = await db.insert(usersTable)
        .values({
          full_name: 'Test User',
          email: 'test@example.com',
          password_hash: 'hashed_password'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      // Create test skill
      const skillResult = await db.insert(skillsTable)
        .values({
          name: 'Python',
          category: 'Programming'
        })
        .returning()
        .execute();

      // Create user skill without proofs or certificates
      await db.insert(userSkillsTable)
        .values({
          user_id: userId,
          skill_id: skillResult[0].id,
          is_verified: false
        })
        .execute();

      const result = await getUserPortfolio(userId);

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].skill_name).toEqual('Python');
      expect(result.skills[0].proof_count).toEqual(0);
      expect(result.skills[0].certificate_url).toBeUndefined();
      expect(result.total_certificates).toEqual(0);
    });
  });
});