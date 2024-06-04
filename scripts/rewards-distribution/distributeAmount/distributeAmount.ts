import BigNumber from "bignumber.js";
import { Address } from "viem";

// Distributes a total amount of RUNE to a set of accounts based on their earned rewards.
// If there is a remainder of RUNE base units, the remainder is distributed to the accounts
// with the largest proportion of the total rewards.
export const distributeAmount = (
  totalRuneAmountToDistroBaseUnit: bigint,
  earnedRewardsByAccount: Record<Address, bigint>,
) => {
  // Set the precision to the maximum possible value to avoid rounding errors
  BigNumber.config({ DECIMAL_PLACES: 1e9 });

  const totalEarnedRewards = Object.values(earnedRewardsByAccount).reduce(
    (sum, earnedRewards) => sum + earnedRewards,
    0n,
  );

  const earnedRewardsByAccountArray = Object.entries(
    earnedRewardsByAccount,
  ).map(([account, earnedRewards]) => {
    const proportionOfRewards = BigNumber(earnedRewards.toString()).div(
      totalEarnedRewards.toString(),
    );
    return { account: account as Address, earnedRewards, proportionOfRewards };
  });

  const runeAllocationBaseUnitByAccount: Record<Address, bigint> = {};

  // Calculate each user's share ignoring remainder (we'll add it later)
  for (const { account, proportionOfRewards } of earnedRewardsByAccountArray) {
    // Calculate the integer allocation ignoring remainder.
    // Rounds towards nearest neighbor. If equidistant, rounds towards -Infinity.
    runeAllocationBaseUnitByAccount[account as Address] = BigInt(
      proportionOfRewards
        .times(totalRuneAmountToDistroBaseUnit.toString())
        .toFixed(0, BigNumber.ROUND_HALF_FLOOR),
    );
  }

  // Calculate the allocated amount so far (to determine remainder)
  const totalAllocationRuneBaseUnitBeforeRemainder = Object.values(
    runeAllocationBaseUnitByAccount,
  ).reduce((sum, runeAllocationBaseUnit) => sum + runeAllocationBaseUnit, 0n);

  // Determine the remainder
  let remainderRuneAmountBaseUnit =
    totalRuneAmountToDistroBaseUnit -
    totalAllocationRuneBaseUnitBeforeRemainder;

  // If there's no remaining amount, return the distribution by account
  if (remainderRuneAmountBaseUnit === 0n) {
    return runeAllocationBaseUnitByAccount;
  }

  // Sort the accounts by their proportion of the total rewards in descending order
  // so the accounts with the largest reward get preference for the remainder
  earnedRewardsByAccountArray.sort((a, b) => {
    return b.proportionOfRewards.minus(a.proportionOfRewards).toNumber();
  });

  // Distribute the remainder one base unit at a time until everything is distributed
  let i = 0;
  while (remainderRuneAmountBaseUnit !== 0n) {
    if (!earnedRewardsByAccountArray[i]) break;

    const account = earnedRewardsByAccountArray[i].account;
    const baseUnitToAdd: bigint = remainderRuneAmountBaseUnit > 0n ? 1n : -1n;
    runeAllocationBaseUnitByAccount[account] += baseUnitToAdd;
    remainderRuneAmountBaseUnit -= baseUnitToAdd;
    i = (i + 1) % earnedRewardsByAccountArray.length;
  }

  return runeAllocationBaseUnitByAccount;
};
