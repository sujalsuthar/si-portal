/**
 * Idempotent cyber-security demo content — runs on every seed (including existing production DBs).
 * Adds course, batch, feed, sessions, exams, tasks, projects, certs, and sample notifications.
 */
import {
  PrismaClient,
  RoleName,
  StudentStatus,
  BatchStatus,
  SessionType,
  SessionStatus,
  QuestionType,
  ExamStatus,
  GradeStatus,
  TaskStatus,
  CertificationStatus,
  NotificationCategory,
} from '@prisma/client';
const CYBER_FEED_TITLES = [
  'Cyber Security Program — Welcome & Roadmap',
  'Phishing Awareness Week (Mar 3–7)',
  'OWASP Top 10 Hands-on Workshop',
  'CompTIA Security+ Cohort — Enrollment Open',
  'Password Hygiene & MFA Setup Reminder',
  'SIEM Lab: Splunk Log Analysis Basics',
  'Ethical Hacking — Legal & Scope Boundaries',
  'Incident Response Tabletop Exercise',
  'Cloud Security: AWS IAM & Least Privilege',
  'Zero Trust Architecture — Guest Lecture',
] as const;

export async function seedCyberSecurityDemo(prisma: PrismaClient) {
  console.log('Ensuring cyber-security demo content…');

  const superAdmin = await prisma.user.findFirst({ where: { role: RoleName.SUPER_ADMIN, isActive: true } });
  const academicAdmin = await prisma.user.findFirst({ where: { role: RoleName.ACADEMIC_ADMIN, isActive: true } });
  if (!superAdmin || !academicAdmin) {
    console.log('Cyber seed skipped: no admin users found.');
    return;
  }

  const cyberFacultyEmails = ['subham.shah@siportal.edu', 'krish.solanki@siportal.edu', 'priya.faculty@siportal.edu'];
  const cyberFacultyUsers = await prisma.user.findMany({
    where: { email: { in: cyberFacultyEmails } },
    include: { faculty: true },
  });
  const leadFaculty = cyberFacultyUsers.find((u) => u.faculty)?.faculty;
  if (leadFaculty) {
    await prisma.faculty.update({
      where: { id: leadFaculty.id },
      data: { department: 'Cyber Security', designation: 'Lead Security Instructor' },
    });
  }
  for (const u of cyberFacultyUsers) {
    if (u.faculty && u.faculty.id !== leadFaculty?.id) {
      await prisma.faculty.update({
        where: { id: u.faculty.id },
        data: { department: 'Cyber Security' },
      });
    }
  }

  const cyberCourse = await prisma.course.upsert({
    where: { code: 'CYSEC' },
    update: {
      name: 'Cyber Security & Ethical Hacking',
      description: 'Network defence, application security, penetration testing, incident response, and security operations.',
      durationWeeks: 26,
    },
    create: {
      name: 'Cyber Security & Ethical Hacking',
      code: 'CYSEC',
      description: 'Network defence, application security, penetration testing, incident response, and security operations.',
      durationWeeks: 26,
    },
  });

  const cyberTopics = [
    'Introduction to Cyber Security & CIA Triad',
    'Network Security, Firewalls & IDS/IPS',
    'Cryptography, Hashing & PKI',
    'Web Application Security (OWASP Top 10)',
    'Penetration Testing Methodology',
    'Incident Response & Digital Forensics',
    'SIEM, Log Analysis & Threat Hunting',
    'Cloud Security & Zero Trust Architecture',
  ];
  const syllabusTopics = [];
  for (let i = 0; i < cyberTopics.length; i++) {
    syllabusTopics.push(
      await prisma.syllabusTopic.upsert({
        where: { id: `cysec-topic-${i}` },
        update: { title: cyberTopics[i], sequence: i + 1, courseId: cyberCourse.id },
        create: { id: `cysec-topic-${i}`, courseId: cyberCourse.id, title: cyberTopics[i], sequence: i + 1 },
      }),
    );
  }

  const cyberBatch = await prisma.batch.upsert({
    where: { code: 'CYSEC-2026-A' },
    update: { name: 'Cyber Security 2026 Batch A', courseId: cyberCourse.id, status: BatchStatus.ACTIVE },
    create: {
      name: 'Cyber Security 2026 Batch A',
      code: 'CYSEC-2026-A',
      courseId: cyberCourse.id,
      startDate: new Date('2026-02-10'),
      capacity: 25,
      status: BatchStatus.ACTIVE,
    },
  });

  for (const u of cyberFacultyUsers) {
    if (!u.faculty) continue;
    await prisma.batchFacultyAssignment.upsert({
      where: { batchId_facultyId_subject: { batchId: cyberBatch.id, facultyId: u.faculty.id, subject: 'Security Operations' } },
      update: {},
      create: { batchId: cyberBatch.id, facultyId: u.faculty.id, subject: 'Security Operations' },
    });
  }

  const cyberStudentDefs = [
    { firstName: 'Rahul', lastName: 'Verma', email: 'rahul.verma@student.siportal.edu', code: 'SI-CYBER-001' },
    { firstName: 'Neha', lastName: 'Desai', email: 'neha.desai@student.siportal.edu', code: 'SI-CYBER-002' },
    { firstName: 'Dev', lastName: 'Shah', email: 'dev.shah@student.siportal.edu', code: 'SI-CYBER-003' },
    { firstName: 'Kiran', lastName: 'Mehta', email: 'kiran.mehta@student.siportal.edu', code: 'SI-CYBER-004' },
  ];

  const cyberStudents = [];
  for (const s of cyberStudentDefs) {
    const existing = await prisma.student.findUnique({ where: { studentCode: s.code } });
    if (existing) {
      cyberStudents.push(existing);
      continue;
    }
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        email: s.email,
        role: RoleName.STUDENT,
        passwordHash: await bcryptHash(process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!'),
        mustChangePassword: false,
      },
    });
    const student = await prisma.student.create({
      data: {
        userId: user.id,
        studentCode: s.code,
        firstName: s.firstName,
        lastName: s.lastName,
        courseId: cyberCourse.id,
        currentBatchId: cyberBatch.id,
        mentorFacultyId: leadFaculty?.id,
        joiningDate: new Date('2026-02-10'),
        status: StudentStatus.ACTIVE,
        phone: `+91-91000${s.code.slice(-3)}`,
      },
    });
    cyberStudents.push(student);

    const parentEmail = `parent.${s.firstName.toLowerCase()}.cyber@siportal.edu`;
    const parentUser = await prisma.user.upsert({
      where: { email: parentEmail },
      update: {},
      create: {
        email: parentEmail,
        role: RoleName.PARENT,
        passwordHash: await bcryptHash(process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!'),
        mustChangePassword: false,
      },
    });
    const parent = await prisma.parentGuardian.upsert({
      where: { userId: parentUser.id },
      update: {},
      create: { userId: parentUser.id, firstName: s.lastName, lastName: 'Family', phone: '+91-8800012345' },
    });
    await prisma.studentParent.upsert({
      where: { studentId_parentId: { studentId: student.id, parentId: parent.id } },
      update: {},
      create: { studentId: student.id, parentId: parent.id, relationship: 'Parent' },
    });
  }

  const feedBodies: Record<string, string> = {
    'Cyber Security Program — Welcome & Roadmap':
      'Welcome to the Cyber Security & Ethical Hacking track. This semester covers network defence, OWASP, penetration testing, SIEM, and incident response. Review the syllabus under Performance → Batches → Cyber Security 2026 Batch A.',
    'Phishing Awareness Week (Mar 3–7)':
      'All students must complete the simulated phishing drill by Friday. Report suspicious emails using the institute template. Parent briefing slides are on the Feed attachment folder.',
    'OWASP Top 10 Hands-on Workshop':
      'Saturday 10:00–13:00 in Lab 3. Bring your laptops with OWASP ZAP installed. We will exploit and remediate SQLi and XSS on the deliberately vulnerable demo app.',
    'CompTIA Security+ Cohort — Enrollment Open':
      'Academic Admin has opened enrollment for the Security+ study cohort. Limited to 20 seats. Register via Action Centre → Academic Query before the deadline.',
    'Password Hygiene & MFA Setup Reminder':
      'Enable MFA under Settings → Profile & Password. Minimum 14-character passphrases for lab VPN accounts. Reuse of personal passwords on institute systems is prohibited.',
    'SIEM Lab: Splunk Log Analysis Basics':
      'Cyber Security Batch A: Tuesday lab covers ingesting Windows Event Logs, creating correlation searches, and triaging brute-force alerts. Pre-read: MITRE ATT&CK T1110.',
    'Ethical Hacking — Legal & Scope Boundaries':
      'Mandatory briefing for all pen-test track students. Written authorization, scope documents, and safe harbour rules will be covered. Attendance is required before lab access.',
    'Incident Response Tabletop Exercise':
      'Simulated ransomware scenario for Batch A. Roles: SOC analyst, incident commander, comms lead. Debrief scheduled for 16:00 the same day.',
    'Cloud Security: AWS IAM & Least Privilege':
      'Guest session on IAM policies, SCPs, and CloudTrail monitoring. Institute-wide stream — recording will be posted after the session.',
    'Zero Trust Architecture — Guest Lecture':
      'Industry speaker on micro-segmentation, device trust, and continuous verification. Q&A open to all batches.',
  };

  let feedCreated = 0;
  for (let i = 0; i < CYBER_FEED_TITLES.length; i++) {
    const title = CYBER_FEED_TITLES[i];
    const exists = await prisma.feedPost.findFirst({ where: { title } });
    if (exists) continue;
    const isBatch = title.includes('Batch A') || title.includes('SIEM Lab');
    const authorId = i % 2 === 0 ? superAdmin.id : academicAdmin.id;
    await prisma.feedPost.create({
      data: {
        authorId,
        title,
        content: feedBodies[title] ?? title,
        batchId: isBatch ? cyberBatch.id : null,
        pinned: i === 0,
      },
    });
    feedCreated++;
  }

  if (leadFaculty) {
    const sessionExists = await prisma.session.findFirst({
      where: { batchId: cyberBatch.id, topic: 'OWASP Top 10 — Injection Flaws' },
    });
    if (!sessionExists) {
      const sessionDate = new Date();
      sessionDate.setDate(sessionDate.getDate() + 1);
      sessionDate.setHours(10, 0, 0, 0);
      await prisma.session.create({
        data: {
          batchId: cyberBatch.id,
          facultyId: leadFaculty.id,
          topic: 'OWASP Top 10 — Injection Flaws',
          description: 'SQL injection and XSS labs using DVWA in isolated VLAN.',
          sessionDate,
          durationMinutes: 120,
          sessionType: SessionType.PRACTICE,
          syllabusTopicId: syllabusTopics[3]?.id,
          status: SessionStatus.SCHEDULED,
        },
      });
      const siemDate = new Date();
      siemDate.setDate(siemDate.getDate() + 3);
      siemDate.setHours(14, 0, 0, 0);
      await prisma.session.create({
        data: {
          batchId: cyberBatch.id,
          facultyId: leadFaculty.id,
          topic: 'SIEM Alert Triage — Brute Force Detection',
          description: 'Splunk search lab: failed logins, geo anomalies, and escalation workflow.',
          sessionDate: siemDate,
          durationMinutes: 90,
          sessionType: SessionType.LECTURE,
          syllabusTopicId: syllabusTopics[6]?.id,
          status: SessionStatus.SCHEDULED,
        },
      });
    }
  }

  const taskExists = await prisma.task.findFirst({ where: { title: 'OWASP ZAP Baseline Scan Report' } });
  if (!taskExists && leadFaculty) {
    const due = new Date();
    due.setDate(due.getDate() + 7);
    const task = await prisma.task.create({
      data: {
        title: 'OWASP ZAP Baseline Scan Report',
        description: 'Run an authenticated baseline scan against the demo web app in the cyber lab VLAN.',
        instructions: 'Submit a PDF with: scope, findings by severity, one critical finding walkthrough, and remediation steps.',
        batchId: cyberBatch.id,
        dueDate: due,
        points: 25,
        createdById: leadFaculty.userId,
      },
    });
    for (const student of cyberStudents) {
      await prisma.taskAssignment.create({ data: { taskId: task.id, studentId: student.id } });
      await prisma.taskSubmission.create({
        data: {
          taskId: task.id,
          studentId: student.id,
          status: student.studentCode.endsWith('001') ? TaskStatus.SUBMITTED : TaskStatus.NOT_STARTED,
          submittedAt: student.studentCode.endsWith('001') ? new Date() : null,
        },
      });
    }
  }

  const examExists = await prisma.exam.findFirst({ where: { title: 'Cyber Security Fundamentals Assessment' } });
  if (!examExists && leadFaculty) {
    const questions = [
      {
        subject: 'Cyber Security',
        topic: 'CIA Triad',
        text: 'Which pillar of the CIA triad ensures data has not been altered without authorization?',
        type: QuestionType.MCQ,
        options: ['Confidentiality', 'Integrity', 'Availability', 'Non-repudiation'],
        answer: 'Integrity',
        marks: 1,
      },
      {
        subject: 'Cyber Security',
        topic: 'OWASP',
        text: 'Which OWASP Top 10 category covers SQL injection and XSS?',
        type: QuestionType.MCQ,
        options: ['Broken Access Control', 'Injection', 'Security Misconfiguration', 'Cryptographic Failures'],
        answer: 'Injection',
        marks: 1,
      },
      {
        subject: 'Cyber Security',
        topic: 'Network Security',
        text: 'Explain the difference between a firewall and an IDS.',
        type: QuestionType.LONG_ANSWER,
        marks: 10,
      },
      {
        subject: 'Cyber Security',
        topic: 'Incident Response',
        text: 'What is the primary goal of the "Contain" phase in incident response?',
        type: QuestionType.MCQ,
        options: ['Delete all logs', 'Limit attacker movement and damage', 'Publish a press release', 'Reinstall antivirus only'],
        answer: 'Limit attacker movement and damage',
        marks: 1,
      },
    ];
    const qRecords = [];
    for (const q of questions) {
      qRecords.push(
        await prisma.question.create({
          data: {
            subject: q.subject,
            topic: q.topic,
            questionText: q.text,
            questionType: q.type,
            options: q.options,
            correctAnswer: q.answer,
            marks: q.marks,
            createdById: leadFaculty.userId,
            courseId: cyberCourse.id,
          },
        }),
      );
    }
    const exam = await prisma.exam.create({
      data: {
        title: 'Cyber Security Fundamentals Assessment',
        courseId: cyberCourse.id,
        batchId: cyberBatch.id,
        subject: 'Cyber Security',
        examDate: new Date(),
        durationMinutes: 45,
        passMarks: 6,
        status: ExamStatus.PUBLISHED,
        createdById: leadFaculty.userId,
      },
    });
    const paper = await prisma.paper.create({ data: { examId: exam.id, name: 'Paper 1', sequence: 1 } });
    let total = 0;
    let seq = 1;
    for (const q of qRecords) {
      await prisma.examQuestion.create({ data: { paperId: paper.id, questionId: q.id, sequence: seq++, marks: q.marks } });
      total += q.marks;
    }
    await prisma.paper.update({ where: { id: paper.id }, data: { totalMarks: total } });
    await prisma.exam.update({ where: { id: exam.id }, data: { totalMarks: total } });
    for (const student of cyberStudents) {
      await prisma.grade.create({
        data: {
          examId: exam.id,
          studentId: student.id,
          marksObtained: 10,
          percentage: (10 / total) * 100,
          gradeLetter: 'B',
          passed: true,
          status: GradeStatus.PUBLISHED,
          enteredById: leadFaculty.userId,
          publishedAt: new Date(),
        },
      });
    }
  }

  const projectExists = await prisma.project.findFirst({ where: { name: 'SOC Tier-1 Alert Triage Simulation' } });
  if (!projectExists && leadFaculty) {
    const project = await prisma.project.create({
      data: {
        batchId: cyberBatch.id,
        name: 'SOC Tier-1 Alert Triage Simulation',
        scope: 'Teams ingest sample alerts, classify true/false positives, and document escalation paths.',
        groupSize: 2,
        createdById: leadFaculty.userId,
      },
    });
    if (cyberStudents.length >= 2) {
      const group = await prisma.projectGroup.create({ data: { projectId: project.id, sequence: 1 } });
      for (const m of cyberStudents.slice(0, 2)) {
        await prisma.projectMember.create({ data: { groupId: group.id, projectId: project.id, studentId: m.id } });
      }
    }
  }

  const certNames = ['CompTIA Security+', 'Certified Ethical Hacker (CEH)', 'CISSP Associate', 'OSCP'];
  for (const name of certNames) {
    const provider = name.includes('CompTIA') ? 'CompTIA' : name.includes('CEH') ? 'EC-Council' : name.includes('CISSP') ? 'ISC2' : 'Offensive Security';
    let catalog = await prisma.certificationCatalog.findFirst({ where: { courseId: cyberCourse.id, name } });
    if (!catalog) {
      catalog = await prisma.certificationCatalog.create({
        data: {
          courseId: cyberCourse.id,
          name,
          provider,
          description: `Industry certification pathway for ${name}.`,
        },
      });
    }
    if (cyberStudents[0]) {
      const has = await prisma.certification.findFirst({ where: { studentId: cyberStudents[0].id, catalogId: catalog.id } });
      if (!has) {
        await prisma.certification.create({
          data: {
            studentId: cyberStudents[0].id,
            catalogId: catalog.id,
            name: catalog.name,
            provider: catalog.provider ?? 'Unknown',
            status: CertificationStatus.IN_PREPARATION,
          },
        });
      }
    }
  }

  const actionExists = await prisma.actionRequest.findFirst({ where: { subject: 'Penetration testing lab scope clarification' } });
  if (!actionExists && cyberStudents[0]) {
    await prisma.actionRequest.create({
      data: {
        requesterId: cyberStudents[0].userId,
        type: 'ACADEMIC_QUERY',
        subject: 'Penetration testing lab scope clarification',
        description: 'Please confirm which subnets are in scope for the upcoming OWASP workshop assessment.',
        targetStudentId: cyberStudents[0].id,
        status: 'PENDING',
      },
    });
  }

  const staffToNotify = await prisma.user.findMany({
    where: { role: { in: [RoleName.SUPER_ADMIN, RoleName.ACADEMIC_ADMIN, RoleName.FACULTY, RoleName.MANAGEMENT] }, isActive: true },
    select: { id: true },
  });
  const cyberNotifTitle = 'Cyber Security demo content ready';
  for (const u of staffToNotify) {
    const has = await prisma.notification.findFirst({ where: { userId: u.id, title: cyberNotifTitle } });
    if (has) continue;
    await prisma.notification.create({
      data: {
        userId: u.id,
        category: NotificationCategory.ANNOUNCEMENT,
        title: cyberNotifTitle,
        message: 'Explore Feed, Cyber Security 2026 Batch A, OWASP task, and Security+ certifications in the portal.',
        link: '/feed',
        isRead: false,
      },
    });
  }

  for (const student of cyberStudents) {
    const studentUser = await prisma.user.findUnique({ where: { id: student.userId } });
    if (!studentUser) continue;
    const has = await prisma.notification.findFirst({
      where: { userId: studentUser.id, title: 'Welcome to Cyber Security Batch A' },
    });
    if (has) continue;
    await prisma.notification.create({
      data: {
        userId: studentUser.id,
        category: NotificationCategory.ANNOUNCEMENT,
        title: 'Welcome to Cyber Security Batch A',
        message: 'Your batch schedule, OWASP lab, and SIEM session are posted on the Feed.',
        link: '/feed',
        isRead: false,
      },
    });
  }

  console.log(`Cyber demo: course CYSEC, batch ${cyberBatch.code}, ${cyberStudents.length} students, ${feedCreated} new feed posts.`);
}

async function bcryptHash(password: string) {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, 12);
}
