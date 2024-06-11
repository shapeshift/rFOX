import { assertValidTotalRuneAllocation } from "./assertValidTotalRuneAllocation";

describe("assertValidTotalRuneAllocation", () => {
  test("doesn't throw when sum of allocations is equal to the total amount to distribute", () => {
    const totalRuneAmountToDistroBaseUnit = 100n;
    const runeAllocationBaseUnitByAccount = {
      "0x1": 50n,
      "0x2": 50n,
    };
    expect(() =>
      assertValidTotalRuneAllocation(
        runeAllocationBaseUnitByAccount,
        totalRuneAmountToDistroBaseUnit,
      ),
    ).not.toThrow();
  });

  test("throws when sum of allocations is not equal to the total amount to distribute", () => {
    const totalRuneAmountToDistroBaseUnit = 100n;
    const runeAllocationBaseUnitByAccount = {
      "0x1": 50n,
      "0x2": 51n,
    };
    expect(() =>
      assertValidTotalRuneAllocation(
        runeAllocationBaseUnitByAccount,
        totalRuneAmountToDistroBaseUnit,
      ),
    ).toThrow("Expected total allocated amount to be 100, got 101");
  });

  test("throws when no allocations and non-zero distribution amount", () => {
    const totalRuneAmountToDistroBaseUnit = 100n;
    const runeAllocationBaseUnitByAccount = {};
    expect(() =>
      assertValidTotalRuneAllocation(
        runeAllocationBaseUnitByAccount,
        totalRuneAmountToDistroBaseUnit,
      ),
    ).toThrow("Expected total allocation > 0");
  });

  test("throws when all allocations are zero and non-zero distribution amount", () => {
    const totalRuneAmountToDistroBaseUnit = 100n;
    const runeAllocationBaseUnitByAccount = {
      "0x1": 0n,
      "0x2": 0n,
    };
    expect(() =>
      assertValidTotalRuneAllocation(
        runeAllocationBaseUnitByAccount,
        totalRuneAmountToDistroBaseUnit,
      ),
    ).toThrow("Expected total allocation > 0");
  });
});
