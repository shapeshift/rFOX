import { prompt, type QuestionCollection } from "inquirer";
import { RUNE_DECIMALS } from "./constants";
import { fromBaseUnit, toBaseUnit } from "./helpers";

const inquireBlockRange = async (): Promise<{
  fromBlock: bigint;
  toBlock: bigint;
}> => {
  const questions: QuestionCollection<{
    fromBlock: bigint;
    toBlock: bigint;
  }> = [
    {
      type: "number",
      name: "fromBlock",
      message: "What is the START block number of this epoch?",
    },
    {
      type: "number",
      name: "toBlock",
      message: "What is the END block number of this epoch?",
    },
  ];

  const { fromBlock, toBlock } = await prompt(questions);
  return { fromBlock, toBlock };
};

const inquireTotalRuneAmountToDistroBaseUnit = async (): Promise<bigint> => {
  const questions: QuestionCollection<{ totalRuneAmountPrecision: number }> = [
    {
      type: "number",
      name: "totalRuneAmountPrecision",
      message:
        "What is the total amount of RUNE to distribute this epoch? Enter this amount in RUNE, not in base units (RUNE*10^8).",
    },
  ];

  const { totalRuneAmountPrecision } = await prompt(questions);
  console.log(totalRuneAmountPrecision);
  const totalRuneAmountBaseUnit = toBaseUnit(
    totalRuneAmountPrecision,
    RUNE_DECIMALS,
  );

  return totalRuneAmountBaseUnit;
};

const confirmResponses = async (
  fromBlock: bigint,
  toBlock: bigint,
  totalRuneAmountToDistroBaseUnit: number,
) => {
  const questions: QuestionCollection<{ confirm: boolean }> = [
    {
      type: "confirm",
      name: "confirm",
      message: [
        "Do you want to proceed with these values?",
        `* Start block: ${fromBlock}`,
        `* End block: ${toBlock}`,
        `* Total RUNE to distribute: ${totalRuneAmountToDistroBaseUnit} RUNE`,
      ].join("\n"),
    },
  ];

  const { confirm } = await prompt(questions);

  if (!confirm) {
    console.log("Exiting...");
    process.exit(0);
  }
};

const main = async () => {
  const { fromBlock, toBlock } = await inquireBlockRange();

  const totalRuneAmountToDistroBaseUnit =
    await inquireTotalRuneAmountToDistroBaseUnit();

  await confirmResponses(
    fromBlock,
    toBlock,
    fromBaseUnit(totalRuneAmountToDistroBaseUnit, RUNE_DECIMALS),
  );

  console.log({
    fromBlock,
    toBlock,
    totalRuneAmountToDistroBaseUnit,
  });
};

main();
