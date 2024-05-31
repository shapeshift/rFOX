import { prompt, type QuestionCollection } from "inquirer";
import { RUNE_DECIMALS } from "./constants";
import { toBaseUnit } from "./helpers";

const validatePositiveNumber = (value: number) => {
  if (isNaN(value)) {
    return "Please enter a valid number";
  }

  if (value < 0) {
    return "Please enter a positive value";
  }

  return true;
};

const validatePositiveInteger = (value: number) => {
  if (!Number.isInteger(value)) {
    return "Please enter an integer";
  }

  return validatePositiveNumber(value);
};

const createValidateBlockNumber = (
  minimumBlockNumber: bigint,
  maximumBlockNumber: bigint,
) => {
  return (value: number) => {
    if (value < minimumBlockNumber) {
      return `Value must be greater than or equal to ${minimumBlockNumber}`;
    }
    if (value > maximumBlockNumber) {
      return `Value must be less than or equal to ${maximumBlockNumber}`;
    }
    return validatePositiveInteger(value);
  };
};

export const inquireBlockRange = async (
  minimumBlockNumber: bigint,
  maximumBlockNumber: bigint,
): Promise<{
  fromBlock: bigint;
  toBlock: bigint;
}> => {
  const validateBlockNumber = createValidateBlockNumber(
    minimumBlockNumber,
    maximumBlockNumber,
  );

  const questions: QuestionCollection<{
    fromBlock: number;
    toBlock: number;
  }> = [
    {
      type: "number",
      name: "fromBlock",
      validate: validateBlockNumber,
      message: "What is the START block number of this epoch?",
      default: 216083216, // TODO: remove this default
    },
    {
      type: "number",
      name: "toBlock",
      validate: (value: number, answers: { fromBlock: number }) => {
        if (value <= answers.fromBlock) {
          return "'to' block must be greater than 'from' block";
        }
        return validateBlockNumber(value);
      },
      message: "What is the END block number of this epoch?",
      default: 216092990, // TODO: remove this default
    },
  ];

  const { fromBlock, toBlock } = await prompt(questions);

  return { fromBlock: BigInt(fromBlock), toBlock: BigInt(toBlock) };
};

export const inquireTotalRuneAmountToDistroBaseUnit =
  async (): Promise<bigint> => {
    const questions: QuestionCollection<{ totalRuneAmountPrecision: number }> =
      [
        {
          type: "number",
          name: "totalRuneAmountPrecision",
          validate: validatePositiveNumber,
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

export const confirmResponses = async (
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
