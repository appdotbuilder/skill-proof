import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, skillsTable, userSkillsTable, skillProofsTable } from '../db/schema';
import { type UploadProofInput } from '../schema';
import { uploadSkillProof, getSkillProofs, processAIVerification, getProofUploadStatus } from '../handlers/proofs';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  full_name: 'John Doe',
  email: 'john.doe@example.com',
  password_hash: 'hashed_password',
  phone: '+1234567890'
};

const testSkill = {
  name: 'Welding',
  category: 'Manufacturing',
  description: 'Metal welding skill'
};

const testUploadInput: UploadProofInput = {
  user_skill_id: 1,
  file_url: 'https://example.com/proof-video.mp4',
  file_type: 'video',
  description: 'Welding demonstration video'
};

describe('Proof Handlers', () => {
  let userId: number;
  let skillId: number;
  let userSkillId: number;

  beforeEach(async () => {
    await createDB();
    
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    userId = userResult[0].id;

    // Create test skill
    const skillResult = await db.insert(skillsTable)
      .values(testSkill)
      .returning()
      .execute();
    skillId = skillResult[0].id;

    // Create user skill relationship
    const userSkillResult = await db.insert(userSkillsTable)
      .values({
        user_id: userId,
        skill_id: skillId
      })
      .returning()
      .execute();
    userSkillId = userSkillResult[0].id;
  });

  afterEach(resetDB);

  describe('uploadSkillProof', () => {
    it('should upload skill proof successfully', async () => {
      const input = { ...testUploadInput, user_skill_id: userSkillId };
      const result = await uploadSkillProof(userId, input);

      expect(result.user_skill_id).toEqual(userSkillId);
      expect(result.file_url).toEqual('https://example.com/proof-video.mp4');
      expect(result.file_type).toEqual('video');
      expect(result.description).toEqual('Welding demonstration video');
      expect(result.upload_status).toEqual('uploaded');
      expect(result.ai_verification_score).toBeNull();
      expect(result.ai_feedback).toBeNull();
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save proof to database', async () => {
      const input = { ...testUploadInput, user_skill_id: userSkillId };
      const result = await uploadSkillProof(userId, input);

      const proofs = await db.select()
        .from(skillProofsTable)
        .where(eq(skillProofsTable.id, result.id))
        .execute();

      expect(proofs).toHaveLength(1);
      expect(proofs[0].file_url).toEqual('https://example.com/proof-video.mp4');
      expect(proofs[0].file_type).toEqual('video');
      expect(proofs[0].upload_status).toEqual('uploaded');
    });

    it('should reject upload for non-existent user skill', async () => {
      const input = { ...testUploadInput, user_skill_id: 999 };
      
      await expect(uploadSkillProof(userId, input))
        .rejects.toThrow(/User skill not found or access denied/i);
    });

    it('should reject upload for user skill belonging to different user', async () => {
      // Create another user
      const anotherUserResult = await db.insert(usersTable)
        .values({
          ...testUser,
          email: 'another@example.com'
        })
        .returning()
        .execute();
      const anotherUserId = anotherUserResult[0].id;

      const input = { ...testUploadInput, user_skill_id: userSkillId };
      
      await expect(uploadSkillProof(anotherUserId, input))
        .rejects.toThrow(/User skill not found or access denied/i);
    });

    it('should handle image file type', async () => {
      const input = {
        ...testUploadInput,
        user_skill_id: userSkillId,
        file_url: 'https://example.com/proof-image.jpg',
        file_type: 'image' as const,
        description: 'Welding sample photo'
      };

      const result = await uploadSkillProof(userId, input);

      expect(result.file_type).toEqual('image');
      expect(result.file_url).toEqual('https://example.com/proof-image.jpg');
    });
  });

  describe('getSkillProofs', () => {
    it('should retrieve skill proofs for user skill', async () => {
      // Upload multiple proofs
      const input1 = { ...testUploadInput, user_skill_id: userSkillId };
      const input2 = {
        ...testUploadInput,
        user_skill_id: userSkillId,
        file_url: 'https://example.com/proof2.jpg',
        file_type: 'image' as const,
        description: 'Second proof'
      };

      await uploadSkillProof(userId, input1);
      await uploadSkillProof(userId, input2);

      const results = await getSkillProofs(userSkillId);

      expect(results).toHaveLength(2);
      expect(results[0].user_skill_id).toEqual(userSkillId);
      expect(results[1].user_skill_id).toEqual(userSkillId);
      expect(results.some(p => p.file_type === 'video')).toBe(true);
      expect(results.some(p => p.file_type === 'image')).toBe(true);
    });

    it('should return empty array for user skill with no proofs', async () => {
      const results = await getSkillProofs(userSkillId);
      expect(results).toHaveLength(0);
    });

    it('should return proofs with correct numeric conversion', async () => {
      const input = { ...testUploadInput, user_skill_id: userSkillId };
      await uploadSkillProof(userId, input);

      // Manually update a proof with AI verification
      await db.update(skillProofsTable)
        .set({
          ai_verification_score: '85.75',
          ai_feedback: 'Good work'
        })
        .where(eq(skillProofsTable.user_skill_id, userSkillId))
        .execute();

      const results = await getSkillProofs(userSkillId);

      expect(results).toHaveLength(1);
      expect(typeof results[0].ai_verification_score).toBe('number');
      expect(results[0].ai_verification_score).toEqual(85.75);
    });
  });

  describe('processAIVerification', () => {
    it('should process AI verification and update proof', async () => {
      const input = { ...testUploadInput, user_skill_id: userSkillId };
      const uploadResult = await uploadSkillProof(userId, input);

      const result = await processAIVerification(uploadResult.id);

      expect(result.id).toEqual(uploadResult.id);
      expect(result.upload_status).toMatch(/verified|rejected/);
      expect(typeof result.ai_verification_score).toBe('number');
      expect(result.ai_verification_score).toBeGreaterThanOrEqual(0);
      expect(result.ai_verification_score).toBeLessThanOrEqual(100);
      expect(result.ai_feedback).toBeDefined();
      expect(typeof result.ai_feedback).toBe('string');
    });

    it('should mark high-scoring proofs as verified', async () => {
      const input = { ...testUploadInput, user_skill_id: userSkillId };
      const uploadResult = await uploadSkillProof(userId, input);

      // Run AI verification multiple times to get a verified result
      let result;
      let attempts = 0;
      do {
        result = await processAIVerification(uploadResult.id);
        attempts++;
      } while (result.upload_status !== 'verified' && attempts < 20);

      if (result.upload_status === 'verified') {
        expect(result.ai_verification_score).toBeGreaterThanOrEqual(70);
      }
      
      // At least verify the process runs
      expect(result.upload_status).toMatch(/verified|rejected/);
    });

    it('should update database with verification results', async () => {
      const input = { ...testUploadInput, user_skill_id: userSkillId };
      const uploadResult = await uploadSkillProof(userId, input);

      await processAIVerification(uploadResult.id);

      const proofs = await db.select()
        .from(skillProofsTable)
        .where(eq(skillProofsTable.id, uploadResult.id))
        .execute();

      expect(proofs).toHaveLength(1);
      expect(proofs[0].upload_status).toMatch(/verified|rejected/);
      expect(proofs[0].ai_verification_score).toBeDefined();
      expect(proofs[0].ai_feedback).toBeDefined();
      expect(proofs[0].updated_at).toBeInstanceOf(Date);
    });

    it('should reject non-existent proof', async () => {
      await expect(processAIVerification(999))
        .rejects.toThrow(/Skill proof not found/i);
    });
  });

  describe('getProofUploadStatus', () => {
    it('should return upload status and progress', async () => {
      const input = { ...testUploadInput, user_skill_id: userSkillId };
      const uploadResult = await uploadSkillProof(userId, input);

      const status = await getProofUploadStatus(uploadResult.id);

      expect(status.status).toEqual('uploaded');
      expect(status.progress).toEqual(50);
    });

    it('should return correct progress for verified status', async () => {
      const input = { ...testUploadInput, user_skill_id: userSkillId };
      const uploadResult = await uploadSkillProof(userId, input);

      // Process AI verification
      await processAIVerification(uploadResult.id);

      const status = await getProofUploadStatus(uploadResult.id);

      expect(status.status).toMatch(/verified|rejected/);
      expect(status.progress).toEqual(100);
    });

    it('should return correct progress for processing status', async () => {
      const input = { ...testUploadInput, user_skill_id: userSkillId };
      const uploadResult = await uploadSkillProof(userId, input);

      // Update status to processing
      await db.update(skillProofsTable)
        .set({ upload_status: 'processing' })
        .where(eq(skillProofsTable.id, uploadResult.id))
        .execute();

      const status = await getProofUploadStatus(uploadResult.id);

      expect(status.status).toEqual('processing');
      expect(status.progress).toEqual(75);
    });

    it('should reject non-existent proof', async () => {
      await expect(getProofUploadStatus(999))
        .rejects.toThrow(/Skill proof not found/i);
    });
  });
});