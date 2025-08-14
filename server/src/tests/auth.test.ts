import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type RegisterInput, type LoginInput } from '../schema';
import { registerUser, loginUser, getUserProfile } from '../handlers/auth';
import { eq } from 'drizzle-orm';
import { createHash, pbkdf2Sync } from 'crypto';

const JWT_SECRET = process.env['JWT_SECRET'] || 'development_secret_key';
const SALT_ROUNDS = 10000;

// Helper functions to match the handler implementation
function verifyPassword(password: string, hashedPassword: string): boolean {
  const [salt, hash] = hashedPassword.split(':');
  const verifyHash = pbkdf2Sync(password, salt, SALT_ROUNDS, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

function verifyJWT(token: string, secret: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  
  // Verify signature
  const expectedSignature = createHash('sha256')
    .update(`${encodedHeader}.${encodedPayload}.${secret}`)
    .digest('base64url');
  
  if (signature !== expectedSignature) {
    throw new Error('Invalid token signature');
  }

  // Decode payload
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
  
  // Check expiration
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return payload;
}

// Test inputs
const testRegisterInput: RegisterInput = {
  full_name: 'John Doe',
  email: 'john@example.com',
  phone: '+1234567890',
  password: 'password123'
};

const testLoginInput: LoginInput = {
  email: 'john@example.com',
  password: 'password123'
};

describe('Auth Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('registerUser', () => {
    it('should create a new user with hashed password', async () => {
      const result = await registerUser(testRegisterInput);

      // Check returned user data
      expect(result.full_name).toEqual('John Doe');
      expect(result.email).toEqual('john@example.com');
      expect(result.phone).toEqual('+1234567890');
      expect(result.is_verified).toEqual(false);
      expect(result.rating).toBeNull();
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
      expect(result.password_hash).toBeDefined();
      expect(result.password_hash).not.toEqual('password123'); // Should be hashed
    });

    it('should save user to database with hashed password', async () => {
      const result = await registerUser(testRegisterInput);

      // Verify user exists in database
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.id))
        .execute();

      expect(users).toHaveLength(1);
      const savedUser = users[0];
      expect(savedUser.full_name).toEqual('John Doe');
      expect(savedUser.email).toEqual('john@example.com');
      expect(savedUser.phone).toEqual('+1234567890');
      expect(savedUser.is_verified).toEqual(false);

      // Verify password is properly hashed
      const isPasswordValid = verifyPassword('password123', savedUser.password_hash);
      expect(isPasswordValid).toBe(true);
    });

    it('should handle user with null phone', async () => {
      const inputWithNullPhone: RegisterInput = {
        ...testRegisterInput,
        phone: null
      };

      const result = await registerUser(inputWithNullPhone);
      expect(result.phone).toBeNull();

      // Verify in database
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.id))
        .execute();

      expect(users[0].phone).toBeNull();
    });

    it('should reject duplicate email registration', async () => {
      // Create first user
      await registerUser(testRegisterInput);

      // Try to create another user with same email
      await expect(registerUser(testRegisterInput))
        .rejects.toThrow(/already exists/i);
    });
  });

  describe('loginUser', () => {
    beforeEach(async () => {
      // Create a user for login tests
      await registerUser(testRegisterInput);
    });

    it('should authenticate user with valid credentials', async () => {
      const result = await loginUser(testLoginInput);

      // Check user data
      expect(result.user.full_name).toEqual('John Doe');
      expect(result.user.email).toEqual('john@example.com');
      expect(result.user.phone).toEqual('+1234567890');
      expect(result.user.id).toBeDefined();
      expect(result.user.rating).toBeNull();

      // Check token
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');

      // Verify token is valid JWT
      const decoded = verifyJWT(result.token, JWT_SECRET);
      expect(decoded.userId).toEqual(result.user.id);
      expect(decoded.email).toEqual('john@example.com');
      expect(decoded.exp).toBeDefined(); // Should have expiration
    });

    it('should reject login with invalid email', async () => {
      const invalidEmailInput: LoginInput = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      await expect(loginUser(invalidEmailInput))
        .rejects.toThrow(/invalid email or password/i);
    });

    it('should reject login with invalid password', async () => {
      const invalidPasswordInput: LoginInput = {
        email: 'john@example.com',
        password: 'wrongpassword'
      };

      await expect(loginUser(invalidPasswordInput))
        .rejects.toThrow(/invalid email or password/i);
    });

    it('should handle numeric rating conversion', async () => {
      // Update user with a rating
      await db.update(usersTable)
        .set({ rating: '4.5' }) // Database stores as string
        .where(eq(usersTable.email, 'john@example.com'))
        .execute();

      const result = await loginUser(testLoginInput);
      
      // Should convert to number
      expect(result.user.rating).toEqual(4.5);
      expect(typeof result.user.rating).toBe('number');
    });
  });

  describe('getUserProfile', () => {
    let userId: number;

    beforeEach(async () => {
      // Create a user for profile tests
      const user = await registerUser(testRegisterInput);
      userId = user.id;
    });

    it('should retrieve user profile by ID', async () => {
      const result = await getUserProfile(userId);

      expect(result.id).toEqual(userId);
      expect(result.full_name).toEqual('John Doe');
      expect(result.email).toEqual('john@example.com');
      expect(result.phone).toEqual('+1234567890');
      expect(result.is_verified).toEqual(false);
      expect(result.rating).toBeNull();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.password_hash).toBeDefined();
    });

    it('should throw error for non-existent user', async () => {
      const nonExistentId = 99999;

      await expect(getUserProfile(nonExistentId))
        .rejects.toThrow(/user not found/i);
    });

    it('should handle numeric rating conversion in profile', async () => {
      // Update user with a rating
      await db.update(usersTable)
        .set({ rating: '3.8' }) // Database stores as string
        .where(eq(usersTable.id, userId))
        .execute();

      const result = await getUserProfile(userId);
      
      // Should convert to number
      expect(result.rating).toEqual(3.8);
      expect(typeof result.rating).toBe('number');
    });

    it('should handle user profile with all optional fields populated', async () => {
      // Update user with all optional fields
      await db.update(usersTable)
        .set({
          profile_photo: 'https://example.com/photo.jpg',
          location: 'New York, NY',
          bio: 'Software developer with 5 years experience',
          rating: '4.2'
        })
        .where(eq(usersTable.id, userId))
        .execute();

      const result = await getUserProfile(userId);

      expect(result.profile_photo).toEqual('https://example.com/photo.jpg');
      expect(result.location).toEqual('New York, NY');
      expect(result.bio).toEqual('Software developer with 5 years experience');
      expect(result.rating).toEqual(4.2);
      expect(typeof result.rating).toBe('number');
    });
  });

  describe('Password Security', () => {
    it('should use strong password hashing', async () => {
      const user = await registerUser(testRegisterInput);
      
      // Check that password is hashed (contains salt and hash separated by colon)
      expect(user.password_hash).toContain(':');
      const [salt, hash] = user.password_hash.split(':');
      expect(salt).toHaveLength(64); // 32 bytes as hex = 64 chars
      expect(hash).toHaveLength(128); // 64 bytes as hex = 128 chars
      
      // Verify original password can be validated
      const isValid = verifyPassword('password123', user.password_hash);
      expect(isValid).toBe(true);
      
      // Verify wrong password fails
      const isInvalid = verifyPassword('wrongpassword', user.password_hash);
      expect(isInvalid).toBe(false);
    });
  });

  describe('JWT Token Validation', () => {
    beforeEach(async () => {
      await registerUser(testRegisterInput);
    });

    it('should generate valid JWT tokens', async () => {
      const result = await loginUser(testLoginInput);
      
      // Verify token structure (header.payload.signature)
      expect(result.token.split('.')).toHaveLength(3);
      
      // Decode and verify token
      const decoded = verifyJWT(result.token, JWT_SECRET);
      expect(decoded.userId).toEqual(result.user.id);
      expect(decoded.email).toEqual('john@example.com');
      expect(decoded.iat).toBeDefined(); // issued at
      expect(decoded.exp).toBeDefined(); // expires at
    });

    it('should set appropriate token expiration', async () => {
      const result = await loginUser(testLoginInput);
      
      const decoded = verifyJWT(result.token, JWT_SECRET);
      const expiresIn = decoded.exp - decoded.iat;
      
      // Should be approximately 7 days (604800 seconds)
      expect(expiresIn).toBeGreaterThan(600000); // At least ~7 days
      expect(expiresIn).toBeLessThan(610000); // Not more than ~7 days + buffer
    });

    it('should reject tokens with invalid signatures', async () => {
      const result = await loginUser(testLoginInput);
      
      // Tamper with the token
      const parts = result.token.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}.invalidsignature`;
      
      expect(() => verifyJWT(tamperedToken, JWT_SECRET))
        .toThrow(/invalid token signature/i);
    });
  });
});