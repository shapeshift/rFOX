import { Log, getAbiItem } from "viem";
import { stakingV1Abi } from "./generated/abi-types";

export const stakeEvent = getAbiItem({ abi: stakingV1Abi, name: "Stake" });
export const unstakeEvent = getAbiItem({ abi: stakingV1Abi, name: "Unstake" });
export const updateCooldownPeriodEvent = getAbiItem({
  abi: stakingV1Abi,
  name: "UpdateCooldownPeriod",
});
export const withdrawEvent = getAbiItem({
  abi: stakingV1Abi,
  name: "Withdraw",
});
export const setRuneAddressEvent = getAbiItem({
  abi: stakingV1Abi,
  name: "SetRuneAddress",
});

export const rFoxEvents = [
  stakeEvent,
  unstakeEvent,
  updateCooldownPeriodEvent,
  withdrawEvent,
  setRuneAddressEvent,
] as const;

export type RFoxEvent = (typeof rFoxEvents)[number];

export type StakeLog = Log<bigint, number, false, typeof stakeEvent, true>;
export type UnstakeLog = Log<bigint, number, false, typeof unstakeEvent, true>;
export type UpdateCooldownPeriodLog = Log<
  bigint,
  number,
  false,
  typeof updateCooldownPeriodEvent,
  true
>;
export type WithdrawLog = Log<bigint, number, false, typeof withdrawEvent>;
export type SetRuneAddressLog = Log<
  bigint,
  number,
  false,
  typeof setRuneAddressEvent,
  true
>;

export type RFoxLog =
  | StakeLog
  | UnstakeLog
  | UpdateCooldownPeriodLog
  | WithdrawLog
  | SetRuneAddressLog;
