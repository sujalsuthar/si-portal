/* Seeds a realistic demo dataset so the portal is immediately explorable after deployment. */
import {
  PrismaClient,
  RoleName,
  StudentStatus,
  BatchStatus,
  SessionType,
  SessionStatus,
  AttendanceContext,
  AttendanceStatus,
  QuestionType,
  ExamStatus,
  GradeStatus,
  TaskStatus,
  BehaviourCategory,
  PointType,
  PointSource,
  PresentationStatus,
  CertificationStatus,
  CertificateStatus,
  TransferStatus,
  InterventionSeverity,
  InterventionStatus,
  InterventionTrigger,
  SelfAssessmentApprovalStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { seedCyberSecurityDemo } from './seed-cyber-demo';

const prisma = new PrismaClient();
const DEMO_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
const WEB_URL = process.env.WEB_URL || 'http://localhost:5173';

async function hash(password: string) {
  return bcrypt.hash(password, 12);
}

async function createUser(email: string, role: RoleName) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, role, passwordHash: await hash(DEMO_PASSWORD), mustChangePassword: false },
  });
}

function randomOf<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function seedNamedUsers() {
  const named = [
    { email: 'sujal.suthar@siportal.edu', role: RoleName.SUPER_ADMIN as RoleName },
    { email: 'sagar.patel@siportal.edu', role: RoleName.ACADEMIC_ADMIN as RoleName },
    {
      email: 'subham.shah@siportal.edu',
      role: RoleName.FACULTY as RoleName,
      faculty: { employeeCode: 'FAC-010', firstName: 'Subham', lastName: 'Shah', department: 'Cyber Security', designation: 'Security Instructor' },
    },
    {
      email: 'krish.solanki@siportal.edu',
      role: RoleName.FACULTY as RoleName,
      faculty: { employeeCode: 'FAC-011', firstName: 'Krish', lastName: 'Solanki', department: 'Cyber Security', designation: 'Security Instructor' },
    },
  ];

  for (const entry of named) {
    const user = await createUser(entry.email, entry.role);
    if (entry.faculty) {
      const f = entry.faculty;
      await prisma.faculty.upsert({
        where: { userId: user.id },
        update: { firstName: f.firstName, lastName: f.lastName, employeeCode: f.employeeCode, department: f.department, designation: f.designation },
        create: {
          userId: user.id,
          employeeCode: f.employeeCode,
          firstName: f.firstName,
          lastName: f.lastName,
          department: f.department,
          designation: f.designation,
          joiningDate: new Date('2025-06-01'),
        },
      });
    }
  }

  const fswdBatch = await prisma.batch.findFirst({ where: { code: 'FSWD-2026-A' } });
  if (fswdBatch) {
    for (const email of ['subham.shah@siportal.edu', 'krish.solanki@siportal.edu']) {
      const user = await prisma.user.findUnique({ where: { email }, include: { faculty: true } });
      if (user?.faculty) {
        await prisma.batchFacultyAssignment.upsert({
          where: { batchId_facultyId_subject: { batchId: fswdBatch.id, facultyId: user.faculty.id, subject: 'Lab Support' } },
          update: {},
          create: { batchId: fswdBatch.id, facultyId: user.faculty.id, subject: 'Lab Support' },
        });
      }
    }
  }

  console.log('Named users ensured: sujal.suthar, sagar.patel, subham.shah, krish.solanki');
}

async function seedStaffNotifications() {
  const staffEmails = [
    process.env.SEED_ADMIN_EMAIL || 'admin@siportal.edu',
    'academic.admin@siportal.edu',
    'sagar.patel@siportal.edu',
    'sujal.suthar@siportal.edu',
    'priya.faculty@siportal.edu',
    'subham.shah@siportal.edu',
  ];
  const users = await prisma.user.findMany({ where: { email: { in: staffEmails }, isActive: true }, select: { id: true, email: true } });
  for (const user of users) {
    const existing = await prisma.notification.count({ where: { userId: user.id } });
    if (existing > 0) continue;
    await prisma.notification.createMany({
      data: [
        {
          userId: user.id,
          category: 'GENERAL',
          title: 'Welcome to SI Portal',
          message: 'Your notification centre is active. New requests, updates, and alerts will appear here.',
          link: '/notifications',
          isRead: false,
        },
        {
          userId: user.id,
          category: 'GENERAL',
          title: 'Action Centre',
          message: 'Check the Action Centre for pending student and parent requests.',
          link: '/action-centre',
          isRead: false,
        },
      ],
    });
  }
}

async function main() {
  console.log('Seeding SI Portal demo data...');

  await seedNamedUsers();

  const existingStudents = await prisma.student.count();
  if (existingStudents > 0) {
    console.log(`Seed skipped: database already has ${existingStudents} students (demo data present).`);
    await seedCyberSecurityDemo(prisma);
    await seedStaffNotifications();
    return;
  }

  await prisma.scoringConfig.deleteMany({});
  // Demo deploy: do not force MFA setup on every login (testers would all get stuck).
  // MFA remains available under Settings → Profile; Super Admin can require roles later.
  await prisma.scoringConfig.create({ data: { mfaRequiredRoles: [] } });

  // ---------------------------------------------------------------- Identity
  const superAdminUser = await createUser(process.env.SEED_ADMIN_EMAIL || 'admin@siportal.edu', RoleName.SUPER_ADMIN);
  const managementUser = await createUser('management@siportal.edu', RoleName.MANAGEMENT);
  const academicAdminUser = await createUser('academic.admin@siportal.edu', RoleName.ACADEMIC_ADMIN);

  // ---------------------------------------------------------------- Courses
  const fswdCourse = await prisma.course.upsert({
    where: { code: 'FSWD' },
    update: {},
    create: { name: 'Full Stack Web Development', code: 'FSWD', description: 'End-to-end web application development bootcamp.', durationWeeks: 24 },
  });
  const dsaiCourse = await prisma.course.upsert({
    where: { code: 'DSAI' },
    update: {},
    create: { name: 'Data Science & AI', code: 'DSAI', description: 'Applied data science, ML and AI engineering.', durationWeeks: 28 },
  });

  const fswdTopics = ['HTML & CSS Foundations', 'JavaScript Essentials', 'React Fundamentals', 'Node.js & APIs', 'Databases & SQL'];
  const fswdSyllabus = [];
  for (let i = 0; i < fswdTopics.length; i++) {
    fswdSyllabus.push(
      await prisma.syllabusTopic.upsert({
        where: { id: `fswd-topic-${i}` },
        update: {},
        create: { id: `fswd-topic-${i}`, courseId: fswdCourse.id, title: fswdTopics[i], sequence: i + 1 },
      }),
    );
  }

  // ---------------------------------------------------------------- Faculty
  const facultyDefs = [
    { email: 'priya.faculty@siportal.edu', employeeCode: 'FAC-001', firstName: 'Priya', lastName: 'Sharma', department: 'Web Development', designation: 'Senior Instructor' },
    { email: 'arjun.faculty@siportal.edu', employeeCode: 'FAC-002', firstName: 'Arjun', lastName: 'Mehta', department: 'Data Science', designation: 'Lead Instructor' },
    { email: 'neha.faculty@siportal.edu', employeeCode: 'FAC-003', firstName: 'Neha', lastName: 'Kapoor', department: 'Web Development', designation: 'Instructor' },
  ];
  const faculty = [];
  for (const f of facultyDefs) {
    const user = await createUser(f.email, RoleName.FACULTY);
    faculty.push(
      await prisma.faculty.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, employeeCode: f.employeeCode, firstName: f.firstName, lastName: f.lastName, department: f.department, designation: f.designation, joiningDate: new Date('2024-01-15') },
      }),
    );
  }
  const [mentorFaculty, dataFaculty, secondFswdFaculty] = faculty;

  // ---------------------------------------------------------------- Batches
  const fswdBatch = await prisma.batch.upsert({
    where: { code: 'FSWD-2026-A' },
    update: {},
    create: { name: 'FSWD 2026 Batch A', code: 'FSWD-2026-A', courseId: fswdCourse.id, startDate: new Date('2026-01-05'), capacity: 30, status: BatchStatus.ACTIVE },
  });
  const dsaiBatch = await prisma.batch.upsert({
    where: { code: 'DSAI-2026-A' },
    update: {},
    create: { name: 'DSAI 2026 Batch A', code: 'DSAI-2026-A', courseId: dsaiCourse.id, startDate: new Date('2026-02-02'), capacity: 25, status: BatchStatus.ACTIVE },
  });

  await prisma.batchFacultyAssignment.upsert({
    where: { batchId_facultyId_subject: { batchId: fswdBatch.id, facultyId: mentorFaculty.id, subject: 'JavaScript' } },
    update: {},
    create: { batchId: fswdBatch.id, facultyId: mentorFaculty.id, subject: 'JavaScript' },
  });
  await prisma.batchFacultyAssignment.upsert({
    where: { batchId_facultyId_subject: { batchId: fswdBatch.id, facultyId: secondFswdFaculty.id, subject: 'Databases' } },
    update: {},
    create: { batchId: fswdBatch.id, facultyId: secondFswdFaculty.id, subject: 'Databases' },
  });
  await prisma.batchFacultyAssignment.upsert({
    where: { batchId_facultyId_subject: { batchId: dsaiBatch.id, facultyId: dataFaculty.id, subject: 'Python for Data Science' } },
    update: {},
    create: { batchId: dsaiBatch.id, facultyId: dataFaculty.id, subject: 'Python for Data Science' },
  });

  await prisma.timetableSlot.createMany({
    data: [
      { batchId: fswdBatch.id, dayOfWeek: 1, startTime: '09:00', endTime: '11:00', subject: 'JavaScript', facultyId: mentorFaculty.id, room: 'Lab 1' },
      { batchId: fswdBatch.id, dayOfWeek: 3, startTime: '09:00', endTime: '11:00', subject: 'Databases', facultyId: secondFswdFaculty.id, room: 'Lab 1' },
      { batchId: dsaiBatch.id, dayOfWeek: 2, startTime: '10:00', endTime: '12:00', subject: 'Python for Data Science', facultyId: dataFaculty.id, room: 'Lab 2' },
    ],
    skipDuplicates: true,
  });

  // ---------------------------------------------------------------- Students & Parents
  const studentNames = [
    ['Aarav', 'Kumar'], ['Diya', 'Patel'], ['Vihaan', 'Reddy'], ['Ananya', 'Iyer'], ['Kabir', 'Singh'],
    ['Ishita', 'Nair'], ['Reyansh', 'Gupta'], ['Myra', 'Joshi'], ['Aditya', 'Rao'], ['Saanvi', 'Bose'],
  ];
  const students = [];
  for (let i = 0; i < studentNames.length; i++) {
    const [firstName, lastName] = studentNames[i];
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@student.siportal.edu`;
    const user = await createUser(email, RoleName.STUDENT);
    const student = await prisma.student.upsert({
      where: { studentCode: `SI-2026-${String(i + 1).padStart(3, '0')}` },
      update: {},
      create: {
        userId: user.id,
        studentCode: `SI-2026-${String(i + 1).padStart(3, '0')}`,
        firstName,
        lastName,
        courseId: fswdCourse.id,
        currentBatchId: fswdBatch.id,
        mentorFacultyId: mentorFaculty.id,
        joiningDate: new Date('2026-01-05'),
        status: StudentStatus.ACTIVE,
        phone: `+91-90000${String(10000 + i)}`,
        emergencyContactName: `${firstName} Guardian`,
        emergencyContactPhone: `+91-88888${String(10000 + i)}`,
      },
    });
    students.push(student);

    const parentEmail = `parent.${firstName.toLowerCase()}@siportal.edu`;
    const parentUser = await createUser(parentEmail, RoleName.PARENT);
    const parent = await prisma.parentGuardian.upsert({
      where: { userId: parentUser.id },
      update: {},
      create: { userId: parentUser.id, firstName: `${lastName}`, lastName: 'Family', phone: `+91-77777${String(10000 + i)}` },
    });
    await prisma.studentParent.upsert({
      where: { studentId_parentId: { studentId: student.id, parentId: parent.id } },
      update: {},
      create: { studentId: student.id, parentId: parent.id, relationship: 'Parent' },
    });
  }

  // ---------------------------------------------------------------- Sessions & Attendance
  const sessionDefs = [
    { topic: fswdSyllabus[0], subject: 'HTML & CSS', daysAgo: 21 },
    { topic: fswdSyllabus[1], subject: 'JavaScript', daysAgo: 14 },
    { topic: fswdSyllabus[2], subject: 'React', daysAgo: 7 },
    { topic: fswdSyllabus[3], subject: 'Node.js', daysAgo: 2 },
  ];
  const sessions = [];
  for (const def of sessionDefs) {
    const date = new Date();
    date.setDate(date.getDate() - def.daysAgo);
    const session = await prisma.session.create({
      data: {
        batchId: fswdBatch.id,
        facultyId: mentorFaculty.id,
        topic: def.topic.title,
        description: `${def.subject} — ${def.topic.title}`,
        sessionDate: date,
        durationMinutes: 120,
        sessionType: SessionType.LECTURE,
        syllabusTopicId: def.topic.id,
        status: SessionStatus.COMPLETED,
        notes: `Covered ${def.topic.title} with hands-on exercises.`,
      },
    });
    sessions.push(session);

    for (const student of students) {
      const roll = Math.random();
      const status = roll < 0.82 ? AttendanceStatus.PRESENT : roll < 0.9 ? AttendanceStatus.LATE : roll < 0.97 ? AttendanceStatus.ABSENT : AttendanceStatus.LEAVE;
      await prisma.attendance.create({
        data: { studentId: student.id, sessionId: session.id, context: AttendanceContext.SESSION, status, markedById: mentorFaculty.userId },
      });
    }
  }

  // This-week upcoming sessions so Management/Faculty week calendars are not empty
  for (const offset of [0, 1, 3]) {
    const date = new Date();
    date.setHours(10, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    await prisma.session.create({
      data: {
        batchId: fswdBatch.id,
        facultyId: mentorFaculty.id,
        topic: fswdSyllabus[Math.min(offset, fswdSyllabus.length - 1)].title,
        description: `Scheduled lab — ${fswdSyllabus[Math.min(offset, fswdSyllabus.length - 1)].title}`,
        sessionDate: date,
        durationMinutes: 120,
        sessionType: SessionType.PRACTICE,
        syllabusTopicId: fswdSyllabus[Math.min(offset, fswdSyllabus.length - 1)].id,
        status: SessionStatus.SCHEDULED,
      },
    });
  }
  await prisma.session.create({
    data: {
      batchId: dsaiBatch.id,
      facultyId: dataFaculty.id,
      topic: 'Python for Data Science',
      description: 'DSAI practice session this week',
      sessionDate: (() => { const d = new Date(); d.setHours(14, 0, 0, 0); d.setDate(d.getDate() + 2); return d; })(),
      durationMinutes: 120,
      sessionType: SessionType.PRACTICE,
      status: SessionStatus.SCHEDULED,
    },
  });

  // ---------------------------------------------------------------- Question bank & Exam
  const questionDefs: { subject: string; topic: string; text: string; type: QuestionType; options?: string[]; answer?: string; marks: number; rubric?: { criterion: string; maxMarks: number }[] }[] = [
    { subject: 'JavaScript', topic: 'Fundamentals', text: 'Which keyword declares a block-scoped variable in JavaScript?', type: QuestionType.MCQ, options: ['var', 'let', 'function', 'global'], answer: 'let', marks: 1 },
    { subject: 'JavaScript', topic: 'Async', text: 'Explain what the "await" keyword does inside an async function.', type: QuestionType.LONG_ANSWER, marks: 5, rubric: [{ criterion: 'Mentions pausing execution', maxMarks: 3 }, { criterion: 'Mentions Promise settlement', maxMarks: 2 }] },
    { subject: 'JavaScript', topic: 'Arrays', text: 'Which of these is true about Array.prototype.map()?', type: QuestionType.MCQ, options: ['It mutates the original array', 'It returns a new array', 'It only works on numbers', 'It requires a callback with no arguments'], answer: 'It returns a new array', marks: 1 },
    { subject: 'JavaScript', topic: 'Closures', text: 'Explain what a closure is and give one practical use case.', type: QuestionType.LONG_ANSWER, marks: 10, rubric: [{ criterion: 'Correct definition', maxMarks: 5 }, { criterion: 'Valid practical example', maxMarks: 5 }] },
    { subject: 'JavaScript', topic: 'ES6', text: 'Which array method is used to transform each element and return a new array?', type: QuestionType.MCQ, options: ['forEach', 'map', 'filter', 'reduce'], answer: 'map', marks: 1 },
  ];
  const questions = [];
  for (const q of questionDefs) {
    questions.push(
      await prisma.question.create({
        data: {
          subject: q.subject,
          topic: q.topic,
          questionText: q.text,
          questionType: q.type,
          options: q.options,
          correctAnswer: q.answer,
          marks: q.marks,
          rubric: q.rubric,
          createdById: mentorFaculty.userId,
        },
      }),
    );
  }

  const exam = await prisma.exam.create({
    data: {
      title: 'JavaScript Fundamentals Assessment',
      courseId: fswdCourse.id,
      batchId: fswdBatch.id,
      subject: 'JavaScript',
      examDate: sessions[1].sessionDate,
      durationMinutes: 60,
      passMarks: 8,
      status: ExamStatus.PUBLISHED,
      createdById: mentorFaculty.userId,
    },
  });
  const paper = await prisma.paper.create({ data: { examId: exam.id, name: 'Paper 1', sequence: 1 } });
  let seq = 1;
  let totalMarks = 0;
  for (const q of questions) {
    await prisma.examQuestion.create({ data: { paperId: paper.id, questionId: q.id, sequence: seq++, marks: q.marks } });
    totalMarks += q.marks;
  }
  await prisma.paper.update({ where: { id: paper.id }, data: { totalMarks } });
  await prisma.exam.update({ where: { id: exam.id }, data: { totalMarks } });

  for (const student of students) {
    const pct = 45 + Math.random() * 50;
    const marksObtained = Math.round((pct / 100) * totalMarks * 10) / 10;
    await prisma.attendance.create({
      data: { studentId: student.id, examId: exam.id, context: AttendanceContext.EXAM, status: AttendanceStatus.PRESENT, markedById: mentorFaculty.userId },
    });
    await prisma.grade.create({
      data: {
        examId: exam.id,
        studentId: student.id,
        marksObtained,
        percentage: (marksObtained / totalMarks) * 100,
        gradeLetter: pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : pct >= 40 ? 'E' : 'F',
        passed: marksObtained >= 8,
        status: GradeStatus.PUBLISHED,
        enteredById: mentorFaculty.userId,
        publishedAt: new Date(),
      },
    });
  }

  // ---------------------------------------------------------------- Tasks
  const task = await prisma.task.create({
    data: {
      title: 'Build a Todo App with React',
      description: 'Implement a todo list app using React hooks and local storage persistence.',
      instructions: 'Submit a link to your GitHub repository or a zipped project folder.',
      batchId: fswdBatch.id,
      dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      points: 20,
      createdById: mentorFaculty.userId,
    },
  });
  for (const student of students) {
    await prisma.taskAssignment.create({ data: { taskId: task.id, studentId: student.id } });
    const outcome = Math.random();
    const status = outcome < 0.6 ? TaskStatus.EVALUATED : outcome < 0.8 ? TaskStatus.SUBMITTED : outcome < 0.9 ? TaskStatus.LATE : TaskStatus.NOT_STARTED;
    await prisma.taskSubmission.create({
      data: {
        taskId: task.id,
        studentId: student.id,
        status,
        submittedAt: status === TaskStatus.NOT_STARTED ? null : new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        pointsAwarded: status === TaskStatus.EVALUATED ? Math.round(12 + Math.random() * 8) : null,
        evaluatedById: status === TaskStatus.EVALUATED ? mentorFaculty.id : null,
        evaluatedAt: status === TaskStatus.EVALUATED ? new Date() : null,
        feedback: status === TaskStatus.EVALUATED ? 'Good work — clean component structure.' : null,
      },
    });
  }

  // ---------------------------------------------------------------- Behaviour, Presentations, Self-assessment
  const categories = Object.values(BehaviourCategory);
  for (const student of students) {
    const isPositive = Math.random() > 0.25;
    const event = await prisma.behaviourEvent.create({
      data: {
        studentId: student.id,
        category: randomOf(categories),
        type: isPositive ? PointType.POSITIVE : PointType.NEGATIVE,
        points: isPositive ? Math.round(2 + Math.random() * 3) : -Math.round(1 + Math.random() * 2),
        reason: isPositive ? 'Actively helped peers during lab session.' : 'Submitted lab work late without prior notice.',
        recordedById: mentorFaculty.userId,
        authorizedById: isPositive ? mentorFaculty.userId : academicAdminUser.id,
      },
    });
    await prisma.pointTransaction.create({
      data: { studentId: student.id, source: PointSource.BEHAVIOUR, sourceId: event.id, points: event.points, reason: event.reason },
    });

    await prisma.presentation.create({
      data: {
        studentId: student.id,
        batchId: fswdBatch.id,
        topic: 'Introduction to REST APIs',
        scheduledDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        durationMinutes: 10,
        evaluatorFacultyId: mentorFaculty.id,
        status: PresentationStatus.COMPLETED,
        contentScore: 8,
        communicationScore: 7,
        confidenceScore: 7,
        technicalScore: 8,
        qnaScore: 6,
        timeManagementScore: 9,
        totalScore: 45,
        pointsAwarded: 8,
        feedback: 'Confident delivery, could improve Q&A depth.',
      },
    });

    await prisma.selfAssessment.create({
      data: {
        studentId: student.id,
        periodLabel: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
        topicOrSkill: 'JavaScript',
        confidenceRating: Math.ceil(2 + Math.random() * 3),
        reflection: 'Comfortable with core syntax, want more practice with async patterns.',
        helpNeeded: 'Promises and async/await',
        examReadiness: Math.ceil(2 + Math.random() * 3),
        communicationConfidence: Math.ceil(2 + Math.random() * 3),
        approvalStatus: SelfAssessmentApprovalStatus.APPROVED,
        decidedById: academicAdminUser.id,
        decidedAt: new Date(),
      },
    });
  }

  // Pending approval-request style self-assessments for staff review demos
  for (const student of students.slice(0, 5)) {
    await prisma.selfAssessment.create({
      data: {
        studentId: student.id,
        periodLabel: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
        topicOrSkill: 'React Hooks deep dive',
        platform: 'YouTube',
        link: 'https://example.com/react-hooks',
        approvalStatus: SelfAssessmentApprovalStatus.PENDING,
      },
    });
  }

  // One pending (unauthorized) negative behaviour event for Authorize-button demos
  await prisma.behaviourEvent.create({
    data: {
      studentId: students[2].id,
      category: BehaviourCategory.DISCIPLINE,
      type: PointType.NEGATIVE,
      points: -2,
      reason: 'Left lab early without informing the instructor on duty.',
      recordedById: mentorFaculty.userId,
      authorizedById: null,
    },
  });

  // ---------------------------------------------------------------- Certifications & Certificate
  const catalogEntry = await prisma.certificationCatalog.create({
    data: { courseId: fswdCourse.id, name: 'Meta Front-End Developer', provider: 'Coursera', description: 'Recommended external certification for FSWD students.' },
  });
  for (const student of students.slice(0, 5)) {
    await prisma.certification.create({
      data: {
        studentId: student.id,
        catalogId: catalogEntry.id,
        name: catalogEntry.name,
        provider: catalogEntry.provider,
        status: randomOf([CertificationStatus.RECOMMENDED, CertificationStatus.IN_PREPARATION, CertificationStatus.PASSED]),
      },
    });
  }

  const topStudent = students[0];
  const certificateNumber = `SI-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const qrCodeDataUrl = await QRCode.toDataURL(`${WEB_URL}/verify/${certificateNumber}`, { margin: 1, width: 300 });
  await prisma.certificate.create({
    data: {
      certificateNumber,
      studentId: topStudent.id,
      courseId: fswdCourse.id,
      batchId: fswdBatch.id,
      title: 'Full Stack Web Development — Phase 1 Completion',
      completionDate: new Date(),
      status: CertificateStatus.VALID,
      issuedById: academicAdminUser.id,
      qrCodeDataUrl,
    },
  });

  // ---------------------------------------------------------------- Batch transfer example
  const transferCandidate = students[students.length - 1];
  await prisma.batchTransfer.create({
    data: {
      studentId: transferCandidate.id,
      fromBatchId: fswdBatch.id,
      toBatchId: dsaiBatch.id,
      reason: 'Student requested switch to Data Science track after aptitude assessment.',
      effectiveDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: TransferStatus.PENDING,
      requestedById: academicAdminUser.id,
    },
  });

  // ---------------------------------------------------------------- Intervention case example
  const strugglingStudent = students[students.length - 2];
  await prisma.interventionCase.create({
    data: {
      studentId: strugglingStudent.id,
      severity: InterventionSeverity.MEDIUM,
      triggerType: InterventionTrigger.OVERDUE_TASKS,
      triggerReason: 'Multiple overdue task submissions in the last two weeks.',
      assignedFacultyId: mentorFaculty.id,
      status: InterventionStatus.OPEN,
      followUpDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    },
  });

  // ---------------------------------------------------------------- Accounts role (SAMP 2.0)
  const accountsUser = await createUser('accounts@siportal.edu', RoleName.ACCOUNTS);

  // ---------------------------------------------------------------- Fees (SAMP 2.0)
  const feeStructure = await prisma.feeStructure.create({
    data: { courseId: fswdCourse.id, name: 'FSWD Standard Fee', totalAmount: 60000, planType: 'QUARTERLY', instalmentCount: 4 },
  });
  for (const student of students.slice(0, 6)) {
    const account = await prisma.feeAccount.create({
      data: {
        studentId: student.id,
        feeStructureId: feeStructure.id,
        totalPayable: 60000,
        instalments: {
          createMany: {
            data: [0, 1, 2, 3].map((i) => ({
              sequence: i + 1,
              amount: 15000,
              dueDate: new Date(Date.now() + (i - 1) * 30 * 24 * 60 * 60 * 1000),
            })),
          },
        },
      },
      include: { instalments: true },
    });
    const paidInstalment = account.instalments[0];
    const payment = await prisma.feePayment.create({
      data: {
        feeAccountId: account.id,
        instalmentId: paidInstalment.id,
        amount: 15000,
        mode: 'UPI',
        reference: `UPI-${crypto.randomBytes(3).toString('hex')}`,
        recordedById: accountsUser.id,
      },
    });
    await prisma.instalment.update({ where: { id: paidInstalment.id }, data: { status: 'PAID' } });
    const now = new Date();
    const financialYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const sequence = await prisma.receiptSequence.upsert({
      where: { financialYear },
      update: { lastNumber: { increment: 1 } },
      create: { financialYear, lastNumber: 1 },
    });
    const receiptNumber = `CO-R-${financialYear}-${String(sequence.lastNumber).padStart(6, '0')}`;
    await prisma.receipt.create({
      data: {
        receiptNumber,
        feePaymentId: payment.id,
        issuedById: accountsUser.id,
        verificationCode: crypto.createHmac('sha256', DEMO_PASSWORD).update(receiptNumber).digest('hex'),
      },
    });
  }

  // ---------------------------------------------------------------- Projects (SAMP 2.0)
  const project = await prisma.project.create({
    data: { batchId: fswdBatch.id, name: 'Capstone: Full Stack Portfolio App', scope: 'Build and deploy a full stack app covering the batch syllabus.', groupSize: 3, kind: 'STUDENT', createdById: mentorFaculty.userId },
  });
  for (let g = 0; g < 3; g++) {
    const group = await prisma.projectGroup.create({ data: { projectId: project.id, sequence: g + 1 } });
    const members = students.slice(g * 3, g * 3 + 3);
    for (const m of members) {
      await prisma.projectMember.create({ data: { groupId: group.id, projectId: project.id, studentId: m.id } });
    }
    if (g === 0) {
      await prisma.projectMark.create({ data: { groupId: group.id, marksObtained: 88, maxMarks: 100, gradedById: mentorFaculty.userId } });
    }
  }

  // ---------------------------------------------------------------- Interns (SAMP 2.0)
  const internCandidates = [students[1], students[3], students[5]];
  for (const internCandidate of internCandidates) {
    await prisma.student.update({
      where: { id: internCandidate.id },
      data: { internStatus: 'ACTIVE', internPromotedAt: new Date(), mentorFacultyId: mentorFaculty.id },
    });
    await prisma.internMentorHistory.create({ data: { studentId: internCandidate.id, mentorId: mentorFaculty.id, assignedById: academicAdminUser.id } });
    await prisma.internStateChange.create({ data: { studentId: internCandidate.id, toState: 'ACTIVE', actorId: academicAdminUser.id } });
    await prisma.internRating.create({
      data: {
        studentId: internCandidate.id,
        ratedById: mentorFaculty.id,
        behaviourScore: 70 + Math.floor(Math.random() * 20),
        technicalScore: 70 + Math.floor(Math.random() * 20),
        projectScore: 70 + Math.floor(Math.random() * 20),
        comment: 'Consistent, proactive in stand-ups.',
        mentorComment: 'Strong technical progress this month — keep documenting your API design decisions.',
      },
    });
  }
  await prisma.internLeaveRequest.create({
    data: { studentId: internCandidates[0].id, startDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), endDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), reason: 'Family function' },
  });

  // ---------------------------------------------------------------- Action Centre sample tickets
  await prisma.actionRequest.create({
    data: {
      requesterId: students[0].userId,
      type: 'ACADEMIC_QUERY',
      subject: 'Clarify React module assessment weight',
      description: 'Could you confirm how much the React module contributes to the composite score this term?',
      targetStudentId: students[0].id,
      status: 'PENDING',
    },
  });
  const parentLink = await prisma.studentParent.findFirst({
    where: { studentId: students[0].id },
    include: { parent: true },
  });
  if (parentLink) {
    await prisma.actionRequest.create({
      data: {
        requesterId: parentLink.parent.userId,
        type: 'ATTENDANCE_QUERY',
        subject: 'Absence marked on lab day',
        description: 'My child was present for the Node.js lab but shows as absent. Please review.',
        targetStudentId: students[0].id,
        status: 'PENDING',
      },
    });
  }

  // ---------------------------------------------------------------- Feed (SI Portal 3.5)
  await prisma.feedPost.create({
    data: {
      authorId: superAdminUser.id,
      title: 'Welcome to SI Portal',
      content: 'This is the institute-wide announcement feed. Super Admin, Admin and Team can post here; everyone can read.',
      pinned: true,
    },
  });
  await prisma.feedPost.create({
    data: {
      authorId: mentorFaculty.userId,
      title: 'FSWD Batch A — extra lab hours this week',
      content: 'We are adding an extra lab session on Saturday morning to cover the React fundamentals recap. Attendance is optional but recommended.',
      batchId: fswdBatch.id,
    },
  });

  console.log('\nSeed complete. Demo accounts (all share the same password):');
  console.log(`  Password for every seeded account: ${DEMO_PASSWORD}\n`);
  console.log(`  Super Admin:     ${superAdminUser.email}`);
  console.log(`  Management:      ${managementUser.email}`);
  console.log(`  Academic Admin:  ${academicAdminUser.email}`);
  console.log(`  Accounts:        ${accountsUser.email}`);
  console.log(`  Team:            ${facultyDefs.map((f) => f.email).join(', ')}`);
  console.log(`  Student:         aarav.kumar@student.siportal.edu (and 9 more)`);
  console.log(`  Parent:          parent.aarav@siportal.edu (and 9 more)`);
  console.log(`  Public certificate verification: /verify/${certificateNumber}`);
  console.log(`  Named team: sujal.suthar@, sagar.patel@, subham.shah@, krish.solanki@ (password: ${DEMO_PASSWORD})`);
  console.log(`  No account has two-factor authentication enabled by default — set it up under Settings > Profile & Password.`);

  await seedCyberSecurityDemo(prisma);
  await seedStaffNotifications();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
