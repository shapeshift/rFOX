import BigNumber from "bignumber.js";

export const assertUnreachable = (x: never): never => {
  throw Error(`unhandled case: ${x}`);
};

export const toBaseUnit = (
  amountPrecision: number,
  decimals: number,
): bigint => {
  const amountBaseUnit = BigInt(
    new BigNumber(amountPrecision)
      .times(BigNumber(10).pow(decimals))
      .toFixed(0),
  );

  return amountBaseUnit;
};

export const fromBaseUnit = (
  amountBaseUnit: bigint,
  decimals: number,
): number => {
  return new BigNumber(amountBaseUnit.toString())
    .div(BigNumber(10).pow(decimals))
    .toNumber();
};
