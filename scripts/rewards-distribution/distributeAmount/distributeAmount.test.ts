import { distributeAmount } from "./distributeAmount";

describe("distributeAmount", () => {
  test("basic distribution", () => {
    const totalRuneAmountToDistroBaseUnit = 100n;
    const earnedRewardsByAccount = {
      "0x1": 50n,
      "0x2": 50n,
    };
    const expectedOutput = {
      "0x1": 50n,
      "0x2": 50n,
    };
    expect(
      distributeAmount(totalRuneAmountToDistroBaseUnit, earnedRewardsByAccount),
    ).toEqual(expectedOutput);
  });

  test("uneven distribution", () => {
    const totalRuneAmountToDistroBaseUnit = 100n;
    const earnedRewardsByAccount = {
      "0x1": 60n,
      "0x2": 40n,
    };
    const expectedOutput = {
      "0x1": 60n,
      "0x2": 40n,
    };
    expect(
      distributeAmount(totalRuneAmountToDistroBaseUnit, earnedRewardsByAccount),
    ).toEqual(expectedOutput);
  });

  test("remainder distribution", () => {
    const totalRuneAmountToDistroBaseUnit = 101n;
    const earnedRewardsByAccount = {
      "0x1": 50n,
      "0x2": 50n,
    };
    const output = distributeAmount(
      totalRuneAmountToDistroBaseUnit,
      earnedRewardsByAccount,
    );
    const totalDistributed = Object.values(output).reduce(
      (sum, value) => sum + value,
      0n,
    );
    expect(totalDistributed).toBe(101n);
    expect(output["0x1"] + output["0x2"]).toBe(101n);
  });

  test("zero total distribution", () => {
    const totalRuneAmountToDistroBaseUnit = 0n;
    const earnedRewardsByAccount = {
      "0x1": 50n,
      "0x2": 50n,
    };
    const expectedOutput = {
      "0x1": 0n,
      "0x2": 0n,
    };
    expect(
      distributeAmount(totalRuneAmountToDistroBaseUnit, earnedRewardsByAccount),
    ).toEqual(expectedOutput);
  });

  test("single account", () => {
    const totalRuneAmountToDistroBaseUnit = 100n;
    const earnedRewardsByAccount = {
      "0x1": 100n,
    };
    const expectedOutput = {
      "0x1": 100n,
    };
    expect(
      distributeAmount(totalRuneAmountToDistroBaseUnit, earnedRewardsByAccount),
    ).toEqual(expectedOutput);
  });

  test("no earned rewards", () => {
    const totalRuneAmountToDistroBaseUnit = 100n;
    const earnedRewardsByAccount = {};
    const expectedOutput = {};
    expect(
      distributeAmount(totalRuneAmountToDistroBaseUnit, earnedRewardsByAccount),
    ).toEqual(expectedOutput);
  });

  test("large number", () => {
    const totalRuneAmountToDistroBaseUnit =
      1000000000000000000000000000000000000000000000000000000n;
    const earnedRewardsByAccount = {
      "0x1": 999999999999999999999999999999999999999999999999999999n,
      "0x2": 1n,
    };
    const expectedOutput = {
      "0x1": 999999999999999999999999999999999999999999999999999999n,
      "0x2": 1n,
    };
    expect(
      distributeAmount(totalRuneAmountToDistroBaseUnit, earnedRewardsByAccount),
    ).toEqual(expectedOutput);
  });

  test("negative rewards test (invalid input)", () => {
    const totalRuneAmountToDistroBaseUnit = 100n;
    const earnedRewardsByAccount = {
      "0x1": -50n,
      "0x2": 50n,
    };
    expect(() =>
      distributeAmount(totalRuneAmountToDistroBaseUnit, earnedRewardsByAccount),
    ).toThrow();
  });

  test("remainder distribution test with many accounts", () => {
    const totalRuneAmountToDistroBaseUnit = 1003n;
    const earnedRewardsByAccount = {
      "0x1": 10n,
      "0x2": 20n,
      "0x3": 30n,
      "0x4": 40n,
    };
    const output = distributeAmount(
      totalRuneAmountToDistroBaseUnit,
      earnedRewardsByAccount,
    );
    const totalDistributed = Object.values(output).reduce(
      (sum, value) => sum + value,
      0n,
    );
    expect(totalDistributed).toBe(1003n);
    expect(output["0x1"] + output["0x2"] + output["0x3"] + output["0x4"]).toBe(
      1003n,
    );
  });

  test("edge case test with zero rewards for some accounts", () => {
    const totalRuneAmountToDistroBaseUnit = 100n;
    const earnedRewardsByAccount = {
      "0x1": 50n,
      "0x2": 0n,
    };
    const expectedOutput = {
      "0x1": 100n,
      "0x2": 0n,
    };
    expect(
      distributeAmount(totalRuneAmountToDistroBaseUnit, earnedRewardsByAccount),
    ).toEqual(expectedOutput);
  });
});
