import { Address } from "viem";
import { RFoxLog, StakeLog, SetRuneAddressLog } from "./events";
import { hexToUtf8, isLogType } from "./helpers";

export const getLatestRuneAddressByAccount = (
  orderedLogs: { log: RFoxLog; timestamp: bigint }[],
) => {
  const runeAddressByAccount: Record<Address, string> = {};

  for (const { log } of orderedLogs) {
    if (isLogType("Stake", log)) {
      const stakeLog = log as StakeLog;
      runeAddressByAccount[stakeLog.args.account] = hexToUtf8(
        stakeLog.args.runeAddress,
      );
    }

    if (isLogType("SetRuneAddress", log)) {
      const setRuneAddressLog = log as SetRuneAddressLog;
      runeAddressByAccount[setRuneAddressLog.args.account] = hexToUtf8(
        setRuneAddressLog.args.newRuneAddress,
      );
    }
  }

  return runeAddressByAccount;
};
