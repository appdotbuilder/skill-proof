import { db } from '../db';
import { 
  miniTestsTable, 
  testQuestionsTable, 
  testAttemptsTable, 
  userSkillsTable,
  usersTable,
  skillsTable
} from '../db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { type MiniTest, type TestQuestion, type TestAttempt, type StartTestInput, type SubmitTestInput } from '../schema';

export const getTestsForSkill = async (skillId: number): Promise<MiniTest[]> => {
  try {
    const results = await db.select()
      .from(miniTestsTable)
      .where(
        and(
          eq(miniTestsTable.skill_id, skillId),
          eq(miniTestsTable.is_active, true)
        )
      )
      .orderBy(asc(miniTestsTable.title))
      .execute();

    return results.map(test => ({
      ...test,
      passing_score: test.passing_score // Integer column - no conversion needed
    }));
  } catch (error) {
    console.error('Getting tests for skill failed:', error);
    throw error;
  }
};

export const getTestQuestions = async (testId: number): Promise<TestQuestion[]> => {
  try {
    const results = await db.select()
      .from(testQuestionsTable)
      .where(eq(testQuestionsTable.test_id, testId))
      .orderBy(asc(testQuestionsTable.order_index))
      .execute();

    return results.map(question => ({
      ...question,
      options: question.options ? JSON.parse(question.options) : null,
      points: question.points // Integer column - no conversion needed
    }));
  } catch (error) {
    console.error('Getting test questions failed:', error);
    throw error;
  }
};

export const startTest = async (userId: number, input: StartTestInput): Promise<TestAttempt> => {
  try {
    // Verify user_skill exists and belongs to the user
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
      throw new Error('User skill not found or does not belong to user');
    }

    // Verify test exists and is active
    const test = await db.select()
      .from(miniTestsTable)
      .where(
        and(
          eq(miniTestsTable.id, input.test_id),
          eq(miniTestsTable.is_active, true)
        )
      )
      .execute();

    if (test.length === 0) {
      throw new Error('Test not found or is not active');
    }

    // Calculate total points for the test
    const questions = await db.select()
      .from(testQuestionsTable)
      .where(eq(testQuestionsTable.test_id, input.test_id))
      .execute();

    const totalPoints = questions.reduce((sum, question) => sum + question.points, 0);

    // Create test attempt
    const result = await db.insert(testAttemptsTable)
      .values({
        user_skill_id: input.user_skill_id,
        test_id: input.test_id,
        score: 0,
        total_points: totalPoints,
        passed: false,
        answers: '{}' // Empty answers object
      })
      .returning()
      .execute();

    return {
      ...result[0],
      score: result[0].score, // Integer column - no conversion needed
      total_points: result[0].total_points // Integer column - no conversion needed
    };
  } catch (error) {
    console.error('Starting test failed:', error);
    throw error;
  }
};

export const submitTest = async (userId: number, input: SubmitTestInput): Promise<TestAttempt> => {
  try {
    // Get the test attempt and verify it belongs to the user
    const attemptResult = await db.select()
      .from(testAttemptsTable)
      .innerJoin(userSkillsTable, eq(testAttemptsTable.user_skill_id, userSkillsTable.id))
      .where(
        and(
          eq(testAttemptsTable.id, input.attempt_id),
          eq(userSkillsTable.user_id, userId)
        )
      )
      .execute();

    if (attemptResult.length === 0) {
      throw new Error('Test attempt not found or does not belong to user');
    }

    const attempt = attemptResult[0].test_attempts;

    // Check if test is already completed
    if (attempt.completed_at !== null) {
      throw new Error('Test attempt already completed');
    }

    // Get test questions to calculate score
    const questions = await db.select()
      .from(testQuestionsTable)
      .where(eq(testQuestionsTable.test_id, attempt.test_id))
      .execute();

    // Get test details for passing score
    const testResult = await db.select()
      .from(miniTestsTable)
      .where(eq(miniTestsTable.id, attempt.test_id))
      .execute();

    const test = testResult[0];

    // Calculate score
    let score = 0;
    questions.forEach(question => {
      const userAnswer = input.answers[question.id.toString()];
      if (userAnswer === question.correct_answer) {
        score += question.points;
      }
    });

    const passed = score >= test.passing_score;

    // Update test attempt
    const result = await db.update(testAttemptsTable)
      .set({
        score,
        passed,
        completed_at: new Date(),
        answers: JSON.stringify(input.answers)
      })
      .where(eq(testAttemptsTable.id, input.attempt_id))
      .returning()
      .execute();

    return {
      ...result[0],
      score: result[0].score, // Integer column - no conversion needed
      total_points: result[0].total_points // Integer column - no conversion needed
    };
  } catch (error) {
    console.error('Submitting test failed:', error);
    throw error;
  }
};

export const getUserTestAttempts = async (userId: number, skillId?: number): Promise<TestAttempt[]> => {
  try {
    // Build conditions array
    const conditions = [eq(userSkillsTable.user_id, userId)];

    if (skillId !== undefined) {
      conditions.push(eq(userSkillsTable.skill_id, skillId));
    }

    // Build complete query in one chain
    const results = await db.select()
      .from(testAttemptsTable)
      .innerJoin(userSkillsTable, eq(testAttemptsTable.user_skill_id, userSkillsTable.id))
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(testAttemptsTable.started_at))
      .execute();

    return results.map(result => ({
      ...result.test_attempts,
      score: result.test_attempts.score, // Integer column - no conversion needed
      total_points: result.test_attempts.total_points // Integer column - no conversion needed
    }));
  } catch (error) {
    console.error('Getting user test attempts failed:', error);
    throw error;
  }
};