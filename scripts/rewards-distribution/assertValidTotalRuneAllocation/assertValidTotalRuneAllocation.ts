import assert from "assert";
import { Address } from "viem";

export const assertValidTotalRuneAllocation = (
  runeAllocationBaseUnitByAccount: Record<Address, bigint>,
  totalRuneAmountToDistroBaseUnit: bigint,
) => {
  const totalAllocatedRuneBaseUnitAfterRemainder = Object.values(
    runeAllocationBaseUnitByAccount,
  ).reduce((sum, runeAllocationBaseUnit) => sum + runeAllocationBaseUnit, 0n);

  assert(
    totalAllocatedRuneBaseUnitAfterRemainder > 0n,
    "Expected total allocation > 0",
  );

  assert(
    totalAllocatedRuneBaseUnitAfterRemainder ===
      totalRuneAmountToDistroBaseUnit,
    `Expected total allocated amount to be ${totalRuneAmountToDistroBaseUnit}, got ${totalAllocatedRuneBaseUnitAfterRemainder}`,
  );
};
