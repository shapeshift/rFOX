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
  epochStartBlockNumber: bigint;
  epochEndBlockNumber: bigint;
}> => {
  const validateBlockNumber = createValidateBlockNumber(
    minimumBlockNumber,
    maximumBlockNumber,
  );

  const validateEpochEndBlockNumber = (
    value: number,
    answers: { epochStartBlockNumber: number },
  ) => {
    if (value <= answers.epochStartBlockNumber) {
      return "'to' block must be greater than 'from' block";
    }
    return validateBlockNumber(value);
  };

  const questions: QuestionCollection<{
    epochStartBlockNumber: number;
    epochEndBlockNumber: number;
  }> = [
    {
      type: "number",
      name: "epochStartBlockNumber",
      validate: validateBlockNumber,
      // clear the input on validation error. Return type here is `number|undefined` not boolean (eew)
      filter: (input) =>
        validateBlockNumber(input) === true ? input : undefined,
      message: "What is the START block number of this epoch?",
      default: 216083216, // TODO: remove this default
    },
    {
      type: "number",
      name: "epochEndBlockNumber",
      validate: validateEpochEndBlockNumber,
      // clear the input on validation error. Return type here is `number|undefined` not boolean (eew)
      filter: (input, answers) =>
        validateEpochEndBlockNumber(input, answers) === true
          ? input
          : undefined,
      message: "What is the END block number of this epoch?",
      default: 216092990, // TODO: remove this default
    },
  ];

  const { epochStartBlockNumber, epochEndBlockNumber } =
    await prompt(questions);

  return {
    epochStartBlockNumber: BigInt(epochStartBlockNumber),
    epochEndBlockNumber: BigInt(epochEndBlockNumber),
  };
};

export const inquireTotalRuneAmountToDistroBaseUnit =
  async (): Promise<bigint> => {
    const questions: QuestionCollection<{ totalRuneAmountPrecision: number }> =
      [
        {
          type: "number",
          name: "totalRuneAmountPrecision",
          validate: validatePositiveNumber,
          // clear the input on validation error. Return type here is `number|undefined` not boolean (eew)
          filter: (input) =>
            validatePositiveNumber(input) === true ? input : undefined,
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
  epochStartBlockNumber: bigint,
  epochEndBlockNumber: bigint,
  totalRuneAmountToDistroBaseUnit: number,
) => {
  const questions: QuestionCollection<{ confirm: boolean }> = [
    {
      type: "confirm",
      name: "confirm",
      message: [
        "Do you want to proceed with these values?",
        `* Start block: ${epochStartBlockNumber}`,
        `* End block: ${epochEndBlockNumber}`,
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
