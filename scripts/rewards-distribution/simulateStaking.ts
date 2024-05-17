import { Address, formatUnits, parseUnits } from "viem";
import { Hex } from "viem";

import StakingV1 from "../../foundry/out/StakingV1.sol/StakingV1.json";
import MockFOXToken from "../../foundry/out/MockFOXToken.sol/MockFOXToken.json";
import { localPublicClient, localWalletClient } from "./constants";
import { stakingV1Abi, mockFoxTokenAbi } from "./generated/abi-types";

export const simulateStaking = async () => {
  const walletClient = localWalletClient;
  const publicClient = localPublicClient;
  // Deploy the MockFOXToken contract from Alice's wallet
  const [alice, bob] = await walletClient.getAddresses();
  const mockFoxtokenDeployHash = await walletClient.deployContract({
    abi: mockFoxTokenAbi,
    account: alice,
    bytecode: MockFOXToken.bytecode.object as Hex,
  });

  const { contractAddress: mockFoxtokenContractAddress } =
    await publicClient.waitForTransactionReceipt({
      hash: mockFoxtokenDeployHash,
    });
  console.log(`MockFOXToken deployed to: ${mockFoxtokenContractAddress}`);

  // Deploy the Staking contract with the address of the deployed MockFOXToken as FOX

  const mockStakingDeployHash = await walletClient.deployContract({
    abi: stakingV1Abi,
    account: alice,
    bytecode: StakingV1.bytecode.object as Hex,
    args: [], // The contructor of the Staking contract does not take any arguments
  });

  const { contractAddress: mockStakingContractAddress } =
    await publicClient.waitForTransactionReceipt({
      hash: mockStakingDeployHash,
    });

  if (!mockStakingContractAddress) {
    throw new Error("Staking contract address not found");
  }
  console.log(`Staking deployed to: ${mockStakingContractAddress}`);

  const foxDecimals = await publicClient.readContract({
    address: mockFoxtokenContractAddress as Address,
    abi: mockFoxTokenAbi,
    functionName: "decimals",
    args: [],
  });

  // Make FOX rain to Bob
  const makeItRainTxHash = await walletClient.writeContract({
    address: mockFoxtokenContractAddress as Address,
    abi: mockFoxTokenAbi,
    account: bob,
    functionName: "makeItRain",
    args: [bob, parseUnits("1000", foxDecimals)],
  });

  await publicClient.waitForTransactionReceipt({ hash: makeItRainTxHash });
  console.log(`1000 FOX tokens sent to Bob`);

  const amountToStakeCryptoPrecision = "100";
  const amountToStakeCryptoBaseUnit = parseUnits(
    amountToStakeCryptoPrecision,
    foxDecimals,
  );

  // Approve FOX to be spent by the Staking contract

  const approveTxHash = await walletClient.writeContract({
    address: mockFoxtokenContractAddress as Address,
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

  const stakeTxHash = await walletClient.writeContract({
    address: mockStakingContractAddress as Address,
    abi: stakingV1Abi,
    account: bob,
    functionName: "stake",
    args: [amountToStakeCryptoBaseUnit, ""], // FIXME: add the runeAddress],
  });

  const { transactionHash: stakeTransactionHash } =
    await publicClient.waitForTransactionReceipt({ hash: stakeTxHash });
  console.log(
    `Staked ${amountToStakeCryptoPrecision} FOX from Bob to Staking contract: ${stakeTransactionHash}`,
  );

  const bobStakedBalance = await publicClient.readContract({
    address: mockStakingContractAddress as Address,
    abi: stakingV1Abi,
    functionName: "balanceOf",
    args: [bob],
  });

  console.log(
    `Bob's staked balance: ${formatUnits(bobStakedBalance, foxDecimals)} FOX`,
  );
};
