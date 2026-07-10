const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const runs = await prisma.pipelineRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { pipeline: true }
  });

  if (runs.length === 0) {
    console.log("No pipeline runs found.");
    return;
  }

  console.log("Top 5 Pipeline Runs:");
  for (const lastRun of runs) {
    console.log("-----------------------------------------");
    console.log("ID:", lastRun.id);
    console.log("Pipeline ID:", lastRun.pipelineId);
    console.log("Pipeline Name:", lastRun.pipeline.name);
    console.log("Status:", lastRun.status);
    console.log("Created At:", lastRun.createdAt);
    console.log("Error Message:", lastRun.errorMessage);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
