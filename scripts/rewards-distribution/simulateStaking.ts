import { Address, formatUnits,  parseUnits } from 'viem'
import { Hex } from 'viem'


import FoxStaking from "../../foundry/out/FoxStaking.sol/FOXStaking.json"
import MockFOXToken from "../../foundry/out/FoxStaking.t.sol/MockFOXToken.json"
import { localPublicClient, localWalletClient } from './constants'

export const simulateStaking = async () => {
  
    const walletClient = localWalletClient
    const publicClient = localPublicClient
    // Deploy the MockFOXToken contract from Alice's wallet
    const [alice, bob] = await walletClient.getAddresses()
    const mockFoxtokenDeployHash = await walletClient.deployContract({
      abi: MockFOXToken.abi,
      account: alice,
      bytecode: MockFOXToken.bytecode.object as Hex,
    })

    const { contractAddress: mockFoxtokenContractAddress }  = await publicClient.waitForTransactionReceipt({ hash: mockFoxtokenDeployHash})
    console.log(`MockFOXToken deployed to: ${mockFoxtokenContractAddress}`);

    // Deploy the FOXStaking contract with the address of the deployed MockFOXToken as FOX

    const mockFoxStakingDeployHash = await walletClient.deployContract({
      abi: FoxStaking.abi,
      account: alice,
      bytecode: FoxStaking.bytecode.object as Hex,
      args: [mockFoxtokenContractAddress]
    })

    const { contractAddress: mockFoxStakingContractAddress }  = await publicClient.waitForTransactionReceipt({ hash: mockFoxStakingDeployHash})
    console.log(`FOXStaking deployed to: ${mockFoxStakingContractAddress}`);

    const foxDecimals = await publicClient.readContract({
      address: mockFoxtokenContractAddress as Address,
      abi: MockFOXToken.abi,
      functionName: 'decimals',
      args: []
    }) as number

   // Make FOX rain to Bob
    const makeItRainTxHash = await walletClient.writeContract({
      address: mockFoxtokenContractAddress as Address,
      abi: MockFOXToken.abi,
      account: bob,
      functionName: 'makeItRain',
      args: [bob, parseUnits('1000', foxDecimals)],
    });

    await publicClient.waitForTransactionReceipt({ hash: makeItRainTxHash });
    console.log(`1000 FOX tokens sent to Bob`);

    const amountToStakeCryptoPrecision = '100'
    const amountToStakeCryptoBaseUnit = parseUnits(amountToStakeCryptoPrecision, foxDecimals)
    const runeAddress = 'thor17gw75axcnr8747pkanye45pnrwk7p9c3cqncsv'

    // Approve FOX to be spent by the FOXStaking contract

    const approveTxHash = await walletClient.writeContract({
      address: mockFoxtokenContractAddress as Address,
      abi: MockFOXToken.abi,
      account: bob,
      functionName: 'approve',
      args: [mockFoxStakingContractAddress, amountToStakeCryptoBaseUnit],
    });
    const { transactionHash } = await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

    console.log(`Granted allowance for ${amountToStakeCryptoPrecision} FOX tokens to be spent by FOXStaking contract: ${transactionHash}`);

    const stakeTxHash = await walletClient.writeContract({
      address: mockFoxStakingContractAddress as Address,
      abi: FoxStaking.abi,
      account: bob,
      functionName: 'stake',
      args: [amountToStakeCryptoBaseUnit, runeAddress],
    });

    const { transactionHash: stakeTransactionHash } = await publicClient.waitForTransactionReceipt({ hash: stakeTxHash });
    console.log(`Staked ${amountToStakeCryptoPrecision} FOX from Bob to FOXStaking contract: ${stakeTransactionHash}`);

    const bobStakedBalance = await publicClient.readContract({
      address: mockFoxStakingContractAddress as Address,
      abi: FoxStaking.abi,
      functionName: 'balanceOf',
      args: [bob],
    }) as number

    console.log(`Bob's staked balance: ${formatUnits(BigInt(bobStakedBalance), foxDecimals)} FOX`);
}