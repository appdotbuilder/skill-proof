import { db } from '../db';
import { usersTable } from '../db/schema';
import { type RegisterInput, type LoginInput, type User } from '../schema';
import { eq } from 'drizzle-orm';
import { createHash, pbkdf2Sync, randomBytes } from 'crypto';

const JWT_SECRET = process.env['JWT_SECRET'] || 'development_secret_key';
const SALT_ROUNDS = 10000; // PBKDF2 iterations

// Simple JWT implementation using crypto
function createJWT(payload: any, secret: string, expiresIn: string): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const exp = now + (7 * 24 * 60 * 60); // 7 days in seconds

  const jwtPayload = {
    ...payload,
    iat: now,
    exp: exp
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(jwtPayload)).toString('base64url');
  
  const signature = createHash('sha256')
    .update(`${encodedHeader}.${encodedPayload}.${secret}`)
    .digest('base64url');
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
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

function hashPassword(password: string): string {
  const salt = randomBytes(32).toString('hex');
  const hash = pbkdf2Sync(password, salt, SALT_ROUNDS, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, hashedPassword: string): boolean {
  const [salt, hash] = hashedPassword.split(':');
  const verifyHash = pbkdf2Sync(password, salt, SALT_ROUNDS, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

export async function registerUser(input: RegisterInput): Promise<User> {
  try {
    // Check if user already exists
    const existingUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (existingUser.length > 0) {
      throw new Error('User with this email already exists');
    }

    // Hash the password
    const passwordHash = hashPassword(input.password);

    // Insert new user
    const result = await db.insert(usersTable)
      .values({
        full_name: input.full_name,
        email: input.email,
        phone: input.phone,
        password_hash: passwordHash
      })
      .returning()
      .execute();

    const user = result[0];

    // Convert numeric fields back to numbers
    return {
      ...user,
      rating: user.rating ? parseFloat(user.rating) : null
    };
  } catch (error) {
    console.error('User registration failed:', error);
    throw error;
  }
}

export async function loginUser(input: LoginInput): Promise<{ user: User; token: string }> {
  try {
    // Find user by email
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (users.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = users[0];

    // Verify password
    const isPasswordValid = verifyPassword(input.password, user.password_hash);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Generate JWT token
    const token = createJWT(
      { 
        userId: user.id, 
        email: user.email 
      },
      JWT_SECRET,
      '7d'
    );

    // Return user data with proper type conversions
    const userData: User = {
      ...user,
      rating: user.rating ? parseFloat(user.rating) : null
    };

    return {
      user: userData,
      token
    };
  } catch (error) {
    console.error('User login failed:', error);
    throw error;
  }
}

export async function getUserProfile(userId: number): Promise<User> {
  try {
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (users.length === 0) {
      throw new Error('User not found');
    }

    const user = users[0];

    // Convert numeric fields back to numbers
    return {
      ...user,
      rating: user.rating ? parseFloat(user.rating) : null
    };
  } catch (error) {
    console.error('Get user profile failed:', error);
    throw error;
  }
}