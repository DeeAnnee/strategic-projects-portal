const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const nowIso = () => new Date().toISOString();

const users = [
  {
    azureObjectId: "11111111-1111-1111-1111-111111111111",
    name: "Sofia Submitter",
    email: "submitter@portal.local",
    jobTitle: "Project Analyst",
    department: "Transformation",
    roleType: "BASIC_USER"
  },
  {
    azureObjectId: "22222222-2222-2222-2222-222222222222",
    name: "Avery Finance",
    email: "approver@portal.local",
    jobTitle: "Finance Director",
    department: "Finance",
    roleType: "FINANCE_GOVERNANCE_USER"
  },
  {
    azureObjectId: "33333333-3333-3333-3333-333333333333",
    name: "Ravi Governance",
    email: "reviewer@portal.local",
    jobTitle: "Governance Manager",
    department: "Project Governance",
    roleType: "PROJECT_GOVERNANCE_USER"
  },
  {
    azureObjectId: "44444444-4444-4444-4444-444444444444",
    name: "Selene SPO",
    email: "spo@portal.local",
    jobTitle: "SPO Analyst",
    department: "SPO Committee",
    roleType: "SPO_COMMITTEE_HUB_USER"
  },
  {
    azureObjectId: "55555555-5555-5555-5555-555555555555",
    name: "Morgan PM Admin",
    email: "pmadmin@portal.local",
    jobTitle: "PMO Lead",
    department: "Project Management",
    roleType: "PROJECT_MANAGEMENT_HUB_ADMIN"
  },
  {
    azureObjectId: "66666666-6666-6666-6666-666666666666",
    name: "Jordan PM User",
    email: "pmbasic@portal.local",
    jobTitle: "Project Manager",
    department: "Project Management",
    roleType: "PROJECT_MANAGEMENT_HUB_BASIC_USER"
  },
  {
    azureObjectId: "77777777-7777-7777-7777-777777777777",
    name: "Ada Admin",
    email: "admin@portal.local",
    jobTitle: "System Administrator",
    department: "Technology",
    roleType: "ADMIN"
  }
];

const makeDraftProject = (index, createdByUserId, ownerName, ownerEmail, businessSponsorObjectId) => ({
  id: `SP-2026-${String(100 + index).padStart(3, "0")}`,
  name: `Dummy Draft Proposal ${index}`,
  title: `Dummy Draft Proposal ${index}`,
  summary: "Seeded draft proposal for RBAC and workflow validation.",
  description: "Automatically generated draft proposal record.",
  status: "Draft",
  stage: "Placemat Proposal",
  ownerName,
  ownerEmail,
  createdByUserId,
  businessSponsorObjectId,
  createdAt: new Date(Date.now() - index * 86400000),
  updatedAt: new Date(Date.now() - index * 43200000)
});

const makeFundingProject = (index, createdByUserId, ownerName, ownerEmail, sponsorObjectIds) => ({
  id: `SP-2026-${String(105 + index).padStart(3, "0")}`,
  name: `Dummy Funding Request ${index}`,
  title: `Dummy Funding Request ${index}`,
  summary: "Seeded funding request for approval queue testing.",
  description: "Automatically generated funding request record.",
  status: "Sent for Approval",
  stage: "Sponsor Approval",
  ownerName,
  ownerEmail,
  createdByUserId,
  businessSponsorObjectId: sponsorObjectIds.business,
  businessDelegateObjectId: sponsorObjectIds.delegate,
  technologySponsorObjectId: sponsorObjectIds.technology,
  financeSponsorObjectId: sponsorObjectIds.finance,
  benefitsSponsorObjectId: sponsorObjectIds.benefits,
  createdAt: new Date(Date.now() - (index + 5) * 86400000),
  updatedAt: new Date(Date.now() - (index + 5) * 43200000)
});

async function main() {
  const userByEmail = new Map();

  for (const input of users) {
    const user = await prisma.user.upsert({
      where: { email: input.email },
      update: {
        azureObjectId: input.azureObjectId,
        name: input.name,
        jobTitle: input.jobTitle,
        department: input.department,
        roleType: input.roleType,
        isActive: true
      },
      create: {
        azureObjectId: input.azureObjectId,
        name: input.name,
        email: input.email,
        jobTitle: input.jobTitle,
        department: input.department,
        roleType: input.roleType,
        isActive: true,
        passwordHash: "demo-password"
      }
    });
    userByEmail.set(user.email, user);
  }

  const submitter = userByEmail.get("submitter@portal.local");
  const pmBasic = userByEmail.get("pmbasic@portal.local");
  const pmAdmin = userByEmail.get("pmadmin@portal.local");
  const finance = userByEmail.get("approver@portal.local");
  const governance = userByEmail.get("reviewer@portal.local");
  const admin = userByEmail.get("admin@portal.local");

  const projects = [
    ...Array.from({ length: 5 }, (_, index) =>
      makeDraftProject(
        index + 1,
        submitter.id,
        submitter.name,
        submitter.email,
        finance.azureObjectId
      )
    ),
    ...Array.from({ length: 5 }, (_, index) =>
      makeFundingProject(index + 1, submitter.id, submitter.name, submitter.email, {
        business: finance.azureObjectId,
        delegate: governance.azureObjectId,
        technology: pmAdmin.azureObjectId,
        finance: finance.azureObjectId,
        benefits: admin.azureObjectId
      })
    )
  ];

  for (const project of projects) {
    await prisma.project.upsert({
      where: { id: project.id },
      update: {
        name: project.name,
        title: project.title,
        summary: project.summary,
        description: project.description,
        status: project.status,
        stage: project.stage,
        ownerName: project.ownerName,
        ownerEmail: project.ownerEmail,
        createdByUserId: project.createdByUserId,
        businessSponsorObjectId: project.businessSponsorObjectId,
        businessDelegateObjectId: project.businessDelegateObjectId,
        technologySponsorObjectId: project.technologySponsorObjectId,
        financeSponsorObjectId: project.financeSponsorObjectId,
        benefitsSponsorObjectId: project.benefitsSponsorObjectId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      },
      create: project
    });

    await prisma.projectAssignment.deleteMany({ where: { projectId: project.id } });
    await prisma.projectAssignment.createMany({
      data: [
        {
          id: `asg-${project.id}-pm-basic`,
          projectId: project.id,
          userId: pmBasic.id,
          assignmentType: "PM",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: `asg-${project.id}-gov`,
          projectId: project.id,
          userId: governance.id,
          assignmentType: "Reviewer",
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]
    });

    await prisma.approval.deleteMany({ where: { projectId: project.id } });
    await prisma.approval.createMany({
      data: [
        {
          id: `apr-${project.id}-business`,
          projectId: project.id,
          stage: "BUSINESS",
          status: project.stage === "Sponsor Approval" ? "PENDING" : "APPROVED",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: `apr-${project.id}-technology`,
          projectId: project.id,
          stage: "TECHNOLOGY",
          status: "PENDING",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: `apr-${project.id}-finance`,
          projectId: project.id,
          stage: "FINANCE",
          status: "PENDING",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: `apr-${project.id}-benefits`,
          projectId: project.id,
          stage: "BENEFITS",
          status: "PENDING",
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: submitter.id,
        projectId: project.id,
        actionType: "NEW_SUBMISSION",
        entityType: "project",
        entityId: project.id,
        oldValue: null,
        newValue: {
          status: project.status,
          stage: project.stage,
          source: "seed"
        },
        createdAt: new Date(nowIso())
      }
    });

    if (project.stage === "Sponsor Approval") {
      await prisma.auditLog.create({
        data: {
          actorUserId: submitter.id,
          projectId: project.id,
          actionType: "SUBMIT_FOR_FUNDING",
          entityType: "approval",
          entityId: project.id,
          oldValue: {
            stage: "Placemat Proposal",
            status: "Draft"
          },
          newValue: {
            stage: "Sponsor Approval",
            status: "Sent for Approval"
          },
          createdAt: new Date(nowIso())
        }
      });
    }
  }

  console.log(`Seed complete: ${users.length} users, ${projects.length} projects`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
