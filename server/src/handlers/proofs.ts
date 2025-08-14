import { db } from '../db';
import { skillProofsTable, userSkillsTable } from '../db/schema';
import { type SkillProof, type UploadProofInput } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function uploadSkillProof(userId: number, input: UploadProofInput): Promise<SkillProof> {
  try {
    // Verify that the user_skill_id belongs to the current user
    const userSkill = await db.select()
      .from(userSkillsTable)
      .where(
        and(
          eq(userSkillsTable.id, input.user_skill_id),
          eq(userSkillsTable.user_id, userId)
        )
      )
      .execute();

    if (userSkill.length === 0) {
      throw new Error('User skill not found or access denied');
    }

    // Insert the skill proof record
    const result = await db.insert(skillProofsTable)
      .values({
        user_skill_id: input.user_skill_id,
        file_url: input.file_url,
        file_type: input.file_type,
        description: input.description,
        upload_status: 'uploaded'
      })
      .returning()
      .execute();

    const proof = result[0];
    return {
      ...proof,
      ai_verification_score: proof.ai_verification_score ? parseFloat(proof.ai_verification_score) : null
    };
  } catch (error) {
    console.error('Skill proof upload failed:', error);
    throw error;
  }
}

export async function getSkillProofs(userSkillId: number): Promise<SkillProof[]> {
  try {
    const results = await db.select()
      .from(skillProofsTable)
      .where(eq(skillProofsTable.user_skill_id, userSkillId))
      .execute();

    return results.map(proof => ({
      ...proof,
      ai_verification_score: proof.ai_verification_score ? parseFloat(proof.ai_verification_score) : null
    }));
  } catch (error) {
    console.error('Failed to get skill proofs:', error);
    throw error;
  }
}

export async function processAIVerification(proofId: number): Promise<SkillProof> {
  try {
    // Simulate AI verification process
    const aiScore = Math.random() * 100; // Random score 0-100
    const aiReasons = [
      'Good technique demonstrated',
      'Clear demonstration of skill proficiency',
      'Professional quality work shown',
      'Adequate skill level displayed',
      'Needs improvement in execution'
    ];
    const aiFeedback = aiReasons[Math.floor(Math.random() * aiReasons.length)];

    // Update the proof with AI verification results
    const result = await db.update(skillProofsTable)
      .set({
        upload_status: aiScore >= 70 ? 'verified' : 'rejected',
        ai_verification_score: aiScore.toString(),
        ai_feedback: aiFeedback,
        updated_at: new Date()
      })
      .where(eq(skillProofsTable.id, proofId))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Skill proof not found');
    }

    const proof = result[0];
    return {
      ...proof,
      ai_verification_score: proof.ai_verification_score ? parseFloat(proof.ai_verification_score) : null
    };
  } catch (error) {
    console.error('AI verification processing failed:', error);
    throw error;
  }
}

export async function getProofUploadStatus(proofId: number): Promise<{ status: string; progress?: number }> {
  try {
    const results = await db.select()
      .from(skillProofsTable)
      .where(eq(skillProofsTable.id, proofId))
      .execute();

    if (results.length === 0) {
      throw new Error('Skill proof not found');
    }

    const proof = results[0];
    const statusProgressMap: Record<string, number> = {
      'uploading': 25,
      'uploaded': 50,
      'processing': 75,
      'verified': 100,
      'rejected': 100
    };

    return {
      status: proof.upload_status,
      progress: statusProgressMap[proof.upload_status] || 0
    };
  } catch (error) {
    console.error('Failed to get proof upload status:', error);
    throw error;
  }
}