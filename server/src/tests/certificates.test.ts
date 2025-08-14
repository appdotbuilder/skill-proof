import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, skillsTable, userSkillsTable, certificatesTable } from '../db/schema';
import { generateCertificate, getUserCertificates, verifyCertificate, downloadCertificate } from '../handlers/certificates';
import { eq } from 'drizzle-orm';

describe('certificates handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test data setup
  let testUserId: number;
  let testSkillId: number;
  let testUserSkillId: number;
  let unverifiedUserSkillId: number;

  beforeEach(async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        full_name: 'John Doe',
        email: 'john@example.com',
        password_hash: 'hashed_password',
        is_verified: true
      })
      .returning()
      .execute();
    testUserId = userResult[0].id;

    // Create test skill
    const skillResult = await db.insert(skillsTable)
      .values({
        name: 'JavaScript Programming',
        category: 'Programming',
        description: 'JavaScript development skills'
      })
      .returning()
      .execute();
    testSkillId = skillResult[0].id;

    // Create verified user skill
    const userSkillResult = await db.insert(userSkillsTable)
      .values({
        user_id: testUserId,
        skill_id: testSkillId,
        is_verified: true,
        verification_date: new Date()
      })
      .returning()
      .execute();
    testUserSkillId = userSkillResult[0].id;

    // Create unverified user skill
    const unverifiedResult = await db.insert(userSkillsTable)
      .values({
        user_id: testUserId,
        skill_id: testSkillId,
        is_verified: false
      })
      .returning()
      .execute();
    unverifiedUserSkillId = unverifiedResult[0].id;
  });

  describe('generateCertificate', () => {
    it('should generate certificate for verified user skill', async () => {
      const result = await generateCertificate(testUserSkillId);

      expect(result.user_skill_id).toEqual(testUserSkillId);
      expect(result.certificate_number).toMatch(/^CERT-\d+-[A-F0-9]{8}$/);
      expect(result.qr_code).toBeDefined();
      expect(result.issued_date).toBeInstanceOf(Date);
      expect(result.is_active).toBe(true);
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.id).toBeDefined();

      // Verify QR code contains expected data
      const qrData = JSON.parse(Buffer.from(result.qr_code, 'base64').toString());
      expect(qrData.cert_num).toEqual(result.certificate_number);
      expect(qrData.user_skill_id).toEqual(testUserSkillId);
      expect(qrData.issued).toBeDefined();
    });

    it('should save certificate to database', async () => {
      const result = await generateCertificate(testUserSkillId);

      const certificates = await db.select()
        .from(certificatesTable)
        .where(eq(certificatesTable.id, result.id))
        .execute();

      expect(certificates).toHaveLength(1);
      expect(certificates[0].certificate_number).toEqual(result.certificate_number);
      expect(certificates[0].user_skill_id).toEqual(testUserSkillId);
      expect(certificates[0].is_active).toBe(true);
    });

    it('should throw error for unverified user skill', async () => {
      await expect(generateCertificate(unverifiedUserSkillId))
        .rejects.toThrow(/not verified/i);
    });

    it('should throw error for non-existent user skill', async () => {
      await expect(generateCertificate(999999))
        .rejects.toThrow(/not found/i);
    });

    it('should throw error if certificate already exists', async () => {
      // Generate first certificate
      await generateCertificate(testUserSkillId);

      // Try to generate another certificate for same user skill
      await expect(generateCertificate(testUserSkillId))
        .rejects.toThrow(/already exists/i);
    });

    it('should generate unique certificate numbers', async () => {
      // Create another verified user skill
      const userSkillResult2 = await db.insert(userSkillsTable)
        .values({
          user_id: testUserId,
          skill_id: testSkillId,
          is_verified: true,
          verification_date: new Date()
        })
        .returning()
        .execute();

      const cert1 = await generateCertificate(testUserSkillId);
      const cert2 = await generateCertificate(userSkillResult2[0].id);

      expect(cert1.certificate_number).not.toEqual(cert2.certificate_number);
      expect(cert1.qr_code).not.toEqual(cert2.qr_code);
    });
  });

  describe('getUserCertificates', () => {
    it('should return empty array when user has no certificates', async () => {
      const result = await getUserCertificates(testUserId);
      expect(result).toEqual([]);
    });

    it('should return user certificates', async () => {
      // Generate a certificate
      await generateCertificate(testUserSkillId);

      const result = await getUserCertificates(testUserId);

      expect(result).toHaveLength(1);
      expect(result[0].user_skill_id).toEqual(testUserSkillId);
      expect(result[0].certificate_number).toMatch(/^CERT-\d+-[A-F0-9]{8}$/);
      expect(result[0].is_active).toBe(true);
    });

    it('should return multiple certificates for user', async () => {
      // Create another skill and user skill
      const skill2Result = await db.insert(skillsTable)
        .values({
          name: 'Python Programming',
          category: 'Programming'
        })
        .returning()
        .execute();

      const userSkill2Result = await db.insert(userSkillsTable)
        .values({
          user_id: testUserId,
          skill_id: skill2Result[0].id,
          is_verified: true,
          verification_date: new Date()
        })
        .returning()
        .execute();

      // Generate certificates
      await generateCertificate(testUserSkillId);
      await generateCertificate(userSkill2Result[0].id);

      const result = await getUserCertificates(testUserId);

      expect(result).toHaveLength(2);
      expect(result.every(cert => cert.is_active)).toBe(true);
    });

    it('should not return inactive certificates', async () => {
      // Generate certificate
      const cert = await generateCertificate(testUserSkillId);

      // Deactivate certificate
      await db.update(certificatesTable)
        .set({ is_active: false })
        .where(eq(certificatesTable.id, cert.id))
        .execute();

      const result = await getUserCertificates(testUserId);
      expect(result).toEqual([]);
    });

    it('should throw error for non-existent user', async () => {
      await expect(getUserCertificates(999999))
        .rejects.toThrow(/not found/i);
    });

    it('should not return certificates from other users', async () => {
      // Create another user with certificate
      const user2Result = await db.insert(usersTable)
        .values({
          full_name: 'Jane Doe',
          email: 'jane@example.com',
          password_hash: 'hashed_password'
        })
        .returning()
        .execute();

      const userSkill2Result = await db.insert(userSkillsTable)
        .values({
          user_id: user2Result[0].id,
          skill_id: testSkillId,
          is_verified: true,
          verification_date: new Date()
        })
        .returning()
        .execute();

      await generateCertificate(userSkill2Result[0].id);

      // Original user should have no certificates
      const result = await getUserCertificates(testUserId);
      expect(result).toEqual([]);
    });
  });

  describe('verifyCertificate', () => {
    it('should return certificate when valid number provided', async () => {
      const generatedCert = await generateCertificate(testUserSkillId);

      const result = await verifyCertificate(generatedCert.certificate_number);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(generatedCert.id);
      expect(result!.certificate_number).toEqual(generatedCert.certificate_number);
      expect(result!.user_skill_id).toEqual(testUserSkillId);
      expect(result!.is_active).toBe(true);
    });

    it('should return null for invalid certificate number', async () => {
      const result = await verifyCertificate('INVALID-CERT-123');
      expect(result).toBeNull();
    });

    it('should return null for inactive certificate', async () => {
      const cert = await generateCertificate(testUserSkillId);

      // Deactivate certificate
      await db.update(certificatesTable)
        .set({ is_active: false })
        .where(eq(certificatesTable.id, cert.id))
        .execute();

      const result = await verifyCertificate(cert.certificate_number);
      expect(result).toBeNull();
    });

    it('should handle empty certificate number', async () => {
      const result = await verifyCertificate('');
      expect(result).toBeNull();
    });
  });

  describe('downloadCertificate', () => {
    it('should return download info for valid certificate', async () => {
      const cert = await generateCertificate(testUserSkillId);

      const result = await downloadCertificate(cert.id);

      expect(result.url).toMatch(/https:\/\/certificates\.skillproof\.com\/download\/.*\.pdf/);
      expect(result.url).toContain(cert.certificate_number);
      expect(result.filename).toMatch(/John_Doe_JavaScript_Programming_Certificate\.pdf/);
    });

    it('should sanitize filename properly', async () => {
      // Create user with special characters in name
      const userResult = await db.insert(usersTable)
        .values({
          full_name: 'José María-Smith Jr.',
          email: 'jose@example.com',
          password_hash: 'hashed_password'
        })
        .returning()
        .execute();

      // Create skill with special characters
      const skillResult = await db.insert(skillsTable)
        .values({
          name: 'C# & .NET Programming',
          category: 'Programming'
        })
        .returning()
        .execute();

      const userSkillResult = await db.insert(userSkillsTable)
        .values({
          user_id: userResult[0].id,
          skill_id: skillResult[0].id,
          is_verified: true,
          verification_date: new Date()
        })
        .returning()
        .execute();

      const cert = await generateCertificate(userSkillResult[0].id);
      const result = await downloadCertificate(cert.id);

      expect(result.filename).toMatch(/Jos__Mar_a_Smith_Jr__C_____NET_Programming_Certificate\.pdf/);
      expect(result.filename).not.toMatch(/[^a-zA-Z0-9_.]/);
    });

    it('should throw error for non-existent certificate', async () => {
      await expect(downloadCertificate(999999))
        .rejects.toThrow(/not found/i);
    });

    it('should throw error for inactive certificate', async () => {
      const cert = await generateCertificate(testUserSkillId);

      // Deactivate certificate
      await db.update(certificatesTable)
        .set({ is_active: false })
        .where(eq(certificatesTable.id, cert.id))
        .execute();

      await expect(downloadCertificate(cert.id))
        .rejects.toThrow(/not found.*inactive/i);
    });
  });
});