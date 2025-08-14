import { db } from '../db';
import { certificatesTable, userSkillsTable, skillsTable, usersTable } from '../db/schema';
import { type Certificate } from '../schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

export async function generateCertificate(userSkillId: number): Promise<Certificate> {
  try {
    // Verify that the user_skill exists and is verified
    const userSkill = await db.select()
      .from(userSkillsTable)
      .where(eq(userSkillsTable.id, userSkillId))
      .execute();

    if (!userSkill.length || !userSkill[0].is_verified) {
      throw new Error('User skill not found or not verified');
    }

    // Check if certificate already exists for this user skill
    const existingCert = await db.select()
      .from(certificatesTable)
      .where(eq(certificatesTable.user_skill_id, userSkillId))
      .execute();

    if (existingCert.length > 0) {
      throw new Error('Certificate already exists for this user skill');
    }

    // Generate unique certificate number
    const timestamp = Date.now().toString();
    const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
    const certificateNumber = `CERT-${timestamp}-${randomSuffix}`;

    // Generate QR code data (base64 encoded string representing the certificate)
    const qrData = JSON.stringify({
      cert_num: certificateNumber,
      user_skill_id: userSkillId,
      issued: new Date().toISOString()
    });
    const qrCode = Buffer.from(qrData).toString('base64');

    // Insert certificate record
    const result = await db.insert(certificatesTable)
      .values({
        user_skill_id: userSkillId,
        certificate_number: certificateNumber,
        qr_code: qrCode,
        issued_date: new Date(),
        is_active: true
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Certificate generation failed:', error);
    throw error;
  }
}

export async function getUserCertificates(userId: number): Promise<Certificate[]> {
  try {
    // Verify user exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (!user.length) {
      throw new Error('User not found');
    }

    // Get all certificates for user's skills
    const results = await db.select({
      id: certificatesTable.id,
      user_skill_id: certificatesTable.user_skill_id,
      certificate_number: certificatesTable.certificate_number,
      qr_code: certificatesTable.qr_code,
      issued_date: certificatesTable.issued_date,
      is_active: certificatesTable.is_active,
      created_at: certificatesTable.created_at
    })
      .from(certificatesTable)
      .innerJoin(userSkillsTable, eq(certificatesTable.user_skill_id, userSkillsTable.id))
      .where(
        and(
          eq(userSkillsTable.user_id, userId),
          eq(certificatesTable.is_active, true)
        )
      )
      .execute();

    return results;
  } catch (error) {
    console.error('Get user certificates failed:', error);
    throw error;
  }
}

export async function verifyCertificate(certificateNumber: string): Promise<Certificate | null> {
  try {
    const results = await db.select()
      .from(certificatesTable)
      .where(
        and(
          eq(certificatesTable.certificate_number, certificateNumber),
          eq(certificatesTable.is_active, true)
        )
      )
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Certificate verification failed:', error);
    throw error;
  }
}

export async function downloadCertificate(certificateId: number): Promise<{ url: string; filename: string }> {
  try {
    // Verify certificate exists and is active
    const certificate = await db.select({
      certificate: certificatesTable,
      user_skill: userSkillsTable,
      skill: skillsTable,
      user: usersTable
    })
      .from(certificatesTable)
      .innerJoin(userSkillsTable, eq(certificatesTable.user_skill_id, userSkillsTable.id))
      .innerJoin(skillsTable, eq(userSkillsTable.skill_id, skillsTable.id))
      .innerJoin(usersTable, eq(userSkillsTable.user_id, usersTable.id))
      .where(
        and(
          eq(certificatesTable.id, certificateId),
          eq(certificatesTable.is_active, true)
        )
      )
      .execute();

    if (!certificate.length) {
      throw new Error('Certificate not found or inactive');
    }

    const cert = certificate[0];
    
    // Generate filename with user name and skill
    const sanitizedUserName = cert.user.full_name.replace(/[^a-zA-Z0-9]/g, '_');
    const sanitizedSkillName = cert.skill.name.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${sanitizedUserName}_${sanitizedSkillName}_Certificate.pdf`;

    // In a real implementation, this would generate/upload a PDF and return the actual URL
    // For now, we'll return a mock URL that includes the certificate number for uniqueness
    const url = `https://certificates.skillproof.com/download/${cert.certificate.certificate_number}.pdf`;

    return {
      url,
      filename
    };
  } catch (error) {
    console.error('Certificate download failed:', error);
    throw error;
  }
}