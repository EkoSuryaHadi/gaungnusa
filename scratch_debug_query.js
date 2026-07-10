const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const sources = await prisma.dataSource.findMany({
    orderBy: { id: "desc" }
  });
  console.log("=== Data Sources ===");
  for (const s of sources) {
    console.log(`ID: ${s.id}, Name: ${s.name}, Type: ${s.type}, Status: ${s.status}, Rows: ${s.rowsCount}`);
    if (s.status !== "ACTIVE") {
      console.log(`Config: ${s.config}`);
    }
  }

  const pipelines = await prisma.pipeline.findMany({
    orderBy: { id: "desc" },
    include: { steps: true }
  });
  console.log("=== Pipelines ===");
  for (const p of pipelines) {
    console.log(`ID: ${p.id}, Name: ${p.name}, Status: ${p.status}, Steps count: ${p.steps.length}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
