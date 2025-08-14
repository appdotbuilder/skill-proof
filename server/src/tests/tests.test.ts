import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  skillsTable, 
  userSkillsTable, 
  miniTestsTable, 
  testQuestionsTable, 
  testAttemptsTable 
} from '../db/schema';
import { 
  getTestsForSkill,
  getTestQuestions,
  startTest,
  submitTest,
  getUserTestAttempts
} from '../handlers/tests';
import { type StartTestInput, type SubmitTestInput } from '../schema';

describe('Test Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUser: any;
  let testSkill: any;
  let testUserSkill: any;
  let testMiniTest: any;
  let testQuestions: any[];

  beforeEach(async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        full_name: 'Test User',
        email: 'test@example.com',
        password_hash: 'hashedpassword',
        is_verified: false
      })
      .returning()
      .execute();
    testUser = userResult[0];

    // Create test skill
    const skillResult = await db.insert(skillsTable)
      .values({
        name: 'Welding',
        category: 'Manufacturing',
        description: 'Metal welding skills',
        is_active: true
      })
      .returning()
      .execute();
    testSkill = skillResult[0];

    // Create user skill
    const userSkillResult = await db.insert(userSkillsTable)
      .values({
        user_id: testUser.id,
        skill_id: testSkill.id,
        is_verified: false
      })
      .returning()
      .execute();
    testUserSkill = userSkillResult[0];

    // Create test mini test
    const miniTestResult = await db.insert(miniTestsTable)
      .values({
        skill_id: testSkill.id,
        title: 'Welding Safety Test',
        description: 'Test your welding safety knowledge',
        time_limit: 30,
        passing_score: 80,
        is_active: true
      })
      .returning()
      .execute();
    testMiniTest = miniTestResult[0];

    // Create test questions
    const questionsResult = await db.insert(testQuestionsTable)
      .values([
        {
          test_id: testMiniTest.id,
          question_text: 'What is the proper safety equipment for welding?',
          question_type: 'multiple_choice',
          options: JSON.stringify(['Safety goggles only', 'Helmet, gloves, and protective clothing', 'Just gloves']),
          correct_answer: 'Helmet, gloves, and protective clothing',
          points: 50,
          order_index: 1
        },
        {
          test_id: testMiniTest.id,
          question_text: 'Is welding without ventilation safe?',
          question_type: 'true_false',
          options: JSON.stringify(['True', 'False']),
          correct_answer: 'False',
          points: 50,
          order_index: 2
        }
      ])
      .returning()
      .execute();
    testQuestions = questionsResult;
  });

  describe('getTestsForSkill', () => {
    it('should get active tests for a skill', async () => {
      const result = await getTestsForSkill(testSkill.id);

      expect(result).toHaveLength(1);
      expect(result[0].id).toEqual(testMiniTest.id);
      expect(result[0].title).toEqual('Welding Safety Test');
      expect(result[0].skill_id).toEqual(testSkill.id);
      expect(result[0].passing_score).toEqual(80);
      expect(result[0].is_active).toBe(true);
    });

    it('should not return inactive tests', async () => {
      // Create inactive test
      await db.insert(miniTestsTable)
        .values({
          skill_id: testSkill.id,
          title: 'Inactive Test',
          description: 'This test is inactive',
          passing_score: 70,
          is_active: false
        })
        .execute();

      const result = await getTestsForSkill(testSkill.id);

      expect(result).toHaveLength(1);
      expect(result[0].title).toEqual('Welding Safety Test');
    });

    it('should return empty array for skill with no tests', async () => {
      // Create another skill
      const skillResult = await db.insert(skillsTable)
        .values({
          name: 'Cooking',
          category: 'Food Service',
          is_active: true
        })
        .returning()
        .execute();

      const result = await getTestsForSkill(skillResult[0].id);
      expect(result).toHaveLength(0);
    });
  });

  describe('getTestQuestions', () => {
    it('should get questions for a test in correct order', async () => {
      const result = await getTestQuestions(testMiniTest.id);

      expect(result).toHaveLength(2);
      expect(result[0].order_index).toEqual(1);
      expect(result[1].order_index).toEqual(2);
      expect(result[0].question_text).toEqual('What is the proper safety equipment for welding?');
      expect(result[0].options).toEqual(['Safety goggles only', 'Helmet, gloves, and protective clothing', 'Just gloves']);
      expect(result[0].points).toEqual(50);
      expect(result[1].question_type).toEqual('true_false');
    });

    it('should handle questions with null options', async () => {
      // Create question without options
      await db.insert(testQuestionsTable)
        .values({
          test_id: testMiniTest.id,
          question_text: 'Describe proper welding technique',
          question_type: 'video_task',
          options: null,
          correct_answer: 'Video demonstration',
          points: 25,
          order_index: 3
        })
        .execute();

      const result = await getTestQuestions(testMiniTest.id);

      expect(result).toHaveLength(3);
      const videoQuestion = result.find(q => q.question_type === 'video_task');
      expect(videoQuestion?.options).toBeNull();
    });

    it('should return empty array for non-existent test', async () => {
      const result = await getTestQuestions(99999);
      expect(result).toHaveLength(0);
    });
  });

  describe('startTest', () => {
    const startTestInput: StartTestInput = {
      user_skill_id: 0, // Will be set in test
      test_id: 0 // Will be set in test
    };

    beforeEach(() => {
      startTestInput.user_skill_id = testUserSkill.id;
      startTestInput.test_id = testMiniTest.id;
    });

    it('should create a new test attempt', async () => {
      const result = await startTest(testUser.id, startTestInput);

      expect(result.user_skill_id).toEqual(testUserSkill.id);
      expect(result.test_id).toEqual(testMiniTest.id);
      expect(result.score).toEqual(0);
      expect(result.total_points).toEqual(100); // 50 + 50 points
      expect(result.passed).toBe(false);
      expect(result.started_at).toBeInstanceOf(Date);
      expect(result.completed_at).toBeNull();
      expect(result.answers).toEqual('{}');
      expect(result.id).toBeDefined();
    });

    it('should calculate correct total points', async () => {
      const result = await startTest(testUser.id, startTestInput);
      expect(result.total_points).toEqual(100);
    });

    it('should reject invalid user_skill_id', async () => {
      startTestInput.user_skill_id = 99999;

      await expect(startTest(testUser.id, startTestInput))
        .rejects.toThrow(/User skill not found/i);
    });

    it('should reject user_skill that belongs to another user', async () => {
      // Create another user
      const otherUserResult = await db.insert(usersTable)
        .values({
          full_name: 'Other User',
          email: 'other@example.com',
          password_hash: 'hashedpassword',
          is_verified: false
        })
        .returning()
        .execute();

      await expect(startTest(otherUserResult[0].id, startTestInput))
        .rejects.toThrow(/User skill not found/i);
    });

    it('should reject inactive test', async () => {
      // Create inactive test
      const inactiveTestResult = await db.insert(miniTestsTable)
        .values({
          skill_id: testSkill.id,
          title: 'Inactive Test',
          description: 'This test is inactive',
          passing_score: 70,
          is_active: false
        })
        .returning()
        .execute();

      startTestInput.test_id = inactiveTestResult[0].id;

      await expect(startTest(testUser.id, startTestInput))
        .rejects.toThrow(/Test not found/i);
    });

    it('should reject non-existent test', async () => {
      startTestInput.test_id = 99999;

      await expect(startTest(testUser.id, startTestInput))
        .rejects.toThrow(/Test not found/i);
    });
  });

  describe('submitTest', () => {
    let testAttempt: any;
    let submitTestInput: SubmitTestInput;

    beforeEach(async () => {
      // Start a test first
      const startInput: StartTestInput = {
        user_skill_id: testUserSkill.id,
        test_id: testMiniTest.id
      };
      testAttempt = await startTest(testUser.id, startInput);

      submitTestInput = {
        attempt_id: testAttempt.id,
        answers: {
          [testQuestions[0].id.toString()]: 'Helmet, gloves, and protective clothing',
          [testQuestions[1].id.toString()]: 'False'
        }
      };
    });

    it('should submit test with perfect score', async () => {
      const result = await submitTest(testUser.id, submitTestInput);

      expect(result.id).toEqual(testAttempt.id);
      expect(result.score).toEqual(100);
      expect(result.total_points).toEqual(100);
      expect(result.passed).toBe(true);
      expect(result.completed_at).toBeInstanceOf(Date);
      expect(result.answers).toEqual(JSON.stringify(submitTestInput.answers));
    });

    it('should submit test with partial score', async () => {
      // Wrong answer for first question
      submitTestInput.answers[testQuestions[0].id.toString()] = 'Safety goggles only';

      const result = await submitTest(testUser.id, submitTestInput);

      expect(result.score).toEqual(50); // Only second question correct
      expect(result.passed).toBe(false); // Less than 80% passing score
    });

    it('should submit test with failing score', async () => {
      // Wrong answers for both questions
      submitTestInput.answers = {
        [testQuestions[0].id.toString()]: 'Safety goggles only',
        [testQuestions[1].id.toString()]: 'True'
      };

      const result = await submitTest(testUser.id, submitTestInput);

      expect(result.score).toEqual(0);
      expect(result.passed).toBe(false);
    });

    it('should handle missing answers', async () => {
      // Only answer one question
      submitTestInput.answers = {
        [testQuestions[0].id.toString()]: 'Helmet, gloves, and protective clothing'
      };

      const result = await submitTest(testUser.id, submitTestInput);

      expect(result.score).toEqual(50);
      expect(result.passed).toBe(false);
    });

    it('should reject non-existent attempt', async () => {
      submitTestInput.attempt_id = 99999;

      await expect(submitTest(testUser.id, submitTestInput))
        .rejects.toThrow(/Test attempt not found/i);
    });

    it('should reject attempt from another user', async () => {
      // Create another user
      const otherUserResult = await db.insert(usersTable)
        .values({
          full_name: 'Other User',
          email: 'other@example.com',
          password_hash: 'hashedpassword',
          is_verified: false
        })
        .returning()
        .execute();

      await expect(submitTest(otherUserResult[0].id, submitTestInput))
        .rejects.toThrow(/Test attempt not found/i);
    });

    it('should reject already completed test', async () => {
      // Submit test first time
      await submitTest(testUser.id, submitTestInput);

      // Try to submit again
      await expect(submitTest(testUser.id, submitTestInput))
        .rejects.toThrow(/already completed/i);
    });
  });

  describe('getUserTestAttempts', () => {
    let testAttempt: any;

    beforeEach(async () => {
      // Create a completed test attempt
      const startInput: StartTestInput = {
        user_skill_id: testUserSkill.id,
        test_id: testMiniTest.id
      };
      testAttempt = await startTest(testUser.id, startInput);

      const submitInput: SubmitTestInput = {
        attempt_id: testAttempt.id,
        answers: {
          [testQuestions[0].id.toString()]: 'Helmet, gloves, and protective clothing',
          [testQuestions[1].id.toString()]: 'False'
        }
      };
      await submitTest(testUser.id, submitInput);
    });

    it('should get all test attempts for user', async () => {
      const result = await getUserTestAttempts(testUser.id);

      expect(result).toHaveLength(1);
      expect(result[0].id).toEqual(testAttempt.id);
      expect(result[0].score).toEqual(100);
      expect(result[0].passed).toBe(true);
      expect(result[0].completed_at).toBeInstanceOf(Date);
    });

    it('should filter attempts by skill', async () => {
      // Create another skill and test attempt
      const anotherSkillResult = await db.insert(skillsTable)
        .values({
          name: 'Cooking',
          category: 'Food Service',
          is_active: true
        })
        .returning()
        .execute();

      const anotherUserSkillResult = await db.insert(userSkillsTable)
        .values({
          user_id: testUser.id,
          skill_id: anotherSkillResult[0].id,
          is_verified: false
        })
        .returning()
        .execute();

      const anotherTestResult = await db.insert(miniTestsTable)
        .values({
          skill_id: anotherSkillResult[0].id,
          title: 'Cooking Safety',
          description: 'Food safety test',
          passing_score: 75,
          is_active: true
        })
        .returning()
        .execute();

      const startInput: StartTestInput = {
        user_skill_id: anotherUserSkillResult[0].id,
        test_id: anotherTestResult[0].id
      };
      await startTest(testUser.id, startInput);

      // Get attempts for welding skill only
      const weldingAttempts = await getUserTestAttempts(testUser.id, testSkill.id);
      expect(weldingAttempts).toHaveLength(1);
      expect(weldingAttempts[0].id).toEqual(testAttempt.id);

      // Get attempts for cooking skill only
      const cookingAttempts = await getUserTestAttempts(testUser.id, anotherSkillResult[0].id);
      expect(cookingAttempts).toHaveLength(1);
      expect(cookingAttempts[0].test_id).toEqual(anotherTestResult[0].id);

      // Get all attempts
      const allAttempts = await getUserTestAttempts(testUser.id);
      expect(allAttempts).toHaveLength(2);
    });

    it('should return empty array for user with no attempts', async () => {
      // Create another user
      const otherUserResult = await db.insert(usersTable)
        .values({
          full_name: 'Other User',
          email: 'other@example.com',
          password_hash: 'hashedpassword',
          is_verified: false
        })
        .returning()
        .execute();

      const result = await getUserTestAttempts(otherUserResult[0].id);
      expect(result).toHaveLength(0);
    });

    it('should order attempts by most recent first', async () => {
      // Create another test attempt
      const startInput: StartTestInput = {
        user_skill_id: testUserSkill.id,
        test_id: testMiniTest.id
      };
      const secondAttempt = await startTest(testUser.id, startInput);

      const result = await getUserTestAttempts(testUser.id);

      expect(result).toHaveLength(2);
      expect(result[0].id).toEqual(secondAttempt.id); // More recent attempt first
      expect(result[1].id).toEqual(testAttempt.id);
    });
  });
});