const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const pipelineId = 15;
  const newRules = "NOT_NULL:Reference No\nDATE:transaction date\nDATE:Effective Date\nNUMBER:Debit (IDR)\nNUMBER:Credit (IDR)\nNUMBER:Balance (IDR)";

  // Find step 3 (VALIDATE) of Pipeline 15
  const validateStep = await prisma.pipelineStep.findFirst({
    where: {
      pipelineId: pipelineId,
      type: "VALIDATE"
    }
  });

  if (validateStep) {
    const currentConfig = JSON.parse(validateStep.config || "{}");
    currentConfig.validationRules = newRules;

    await prisma.pipelineStep.update({
      where: { id: validateStep.id },
      data: {
        config: JSON.stringify(currentConfig)
      }
    });

    console.log(`Successfully updated VALIDATE step rules for Pipeline ${pipelineId}.`);
  } else {
    console.error(`VALIDATE step not found for Pipeline ${pipelineId}.`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
