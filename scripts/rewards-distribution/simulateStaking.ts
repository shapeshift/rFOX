import { Address, formatUnits, parseUnits } from "viem";

import {
  localPublicClient,
  localOwnerWalletClient,
  localUserWalletClient,
} from "./constants";
import { stakingV1Abi, mockFoxTokenAbi } from "./generated/abi-types";

export const simulateStaking = async () => {
  const ownerWalletClient = localOwnerWalletClient;
  const userWalletClient = localUserWalletClient;
  const publicClient = localPublicClient;
  const bobRuneAddress = "thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncsv";

  const [bob] = await localUserWalletClient.getAddresses();

  const mockFoxtokenContractAddress = process.env
    .STAKING_TOKEN_ADDRESS as Address;
  const mockStakingContractAddress = process.env
    .STAKING_PROXY_ADDRESS as Address;

  const foxDecimals = await publicClient.readContract({
    address: mockFoxtokenContractAddress,
    abi: mockFoxTokenAbi,
    functionName: "decimals",
    args: [],
  });

  // Make FOX rain to Bob
  const makeItRainTxHash = await ownerWalletClient.writeContract({
    address: mockFoxtokenContractAddress,
    abi: mockFoxTokenAbi,
    account: bob,
    functionName: "makeItRain",
    args: [bob, parseUnits("1000", foxDecimals)],
  });

  await publicClient.waitForTransactionReceipt({ hash: makeItRainTxHash });
  console.log(`1000 FOX tokens sent to Bob`);

  // Check Bob's FOX balance
  const bobFoxBalance = await publicClient.readContract({
    address: mockFoxtokenContractAddress,
    abi: mockFoxTokenAbi,
    functionName: "balanceOf",
    args: [bob],
  });

  console.log(
    `Bob's FOX balance: ${formatUnits(bobFoxBalance, foxDecimals)} FOX`,
  );

  const amountToStakeCryptoPrecision = "100";
  const amountToStakeCryptoBaseUnit = parseUnits(
    amountToStakeCryptoPrecision,
    foxDecimals,
  );

  // Approve FOX to be spent by the Staking contract
  const approveTxHash = await userWalletClient.writeContract({
    address: mockFoxtokenContractAddress,
    abi: mockFoxTokenAbi,
    account: bob,
    functionName: "approve",
    args: [mockStakingContractAddress, amountToStakeCryptoBaseUnit],
  });
  const { transactionHash } = await publicClient.waitForTransactionReceipt({
    hash: approveTxHash,
  });

  console.log(
    `Granted allowance for ${amountToStakeCryptoPrecision} FOX tokens to be spent by Staking contract: ${transactionHash}`,
  );

  // Simulate the staking of FOX tokens so if we see a revert it will be thrown with a reason
  const { request } = await publicClient.simulateContract({
    address: mockStakingContractAddress,
    abi: stakingV1Abi,
    account: bob,
    functionName: "stake",
    args: [amountToStakeCryptoBaseUnit, bobRuneAddress],
  });

  const stakeTxHash = await userWalletClient.writeContract(request);

  const transactionReceipt = await publicClient.waitForTransactionReceipt({
    hash: stakeTxHash,
  });
  const { transactionHash: stakeTransactionHash } = transactionReceipt;
  console.log(
    `Staked ${amountToStakeCryptoPrecision} FOX from Bob to Staking contract: ${stakeTransactionHash}`,
  );

  const bobStakedBalance = await publicClient.readContract({
    address: mockStakingContractAddress,
    abi: stakingV1Abi,
    functionName: "balanceOf",
    args: [bob],
  });

  console.log(
    `Bob's staked balance: ${formatUnits(bobStakedBalance, foxDecimals)} FOX`,
  );
};
