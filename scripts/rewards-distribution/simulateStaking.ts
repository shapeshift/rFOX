import { Address, formatUnits,  parseUnits } from 'viem'
import { Hex } from 'viem'


import FoxStaking from "../../foundry/out/FoxStaking.sol/FOXStaking.json"
import MockFOXToken from "../../foundry/out/FoxStaking.t.sol/MockFOXToken.json"
import { localPublicClient, localWalletClient } from './constants'

export const simulateStaking = async () => {
  
    const walletClient = localWalletClient
    const publicClient = localPublicClient
    // Deploy the MockFOXToken contract from Alice's wallet
    // Assume Alice is the deployer and not a user i.e don't reuse this address for staking
    const [alice, bob, charlie, craig] = await walletClient.getAddresses()
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

    const charactersCast = {bob: {
      address: bob,
      nickname: 'Bob',
      amountToStake: '4242'
    }, 
    charlie: {
      address: charlie,
      nickname: 'Charlie',
      amountToStake: '1337'
    },
    craig: {
      address: craig,
      nickname: 'Craig',
      amountToStake: '6900'
    },
    }

    const stakingPromises = Object.values(charactersCast).map(async ({nickname, address, amountToStake}) => {

    const runeAddress = `thor${nickname}`

   // Make 10,000 FOX rain to each user 
    const makeItRainTxHash = await walletClient.writeContract({
      address: mockFoxtokenContractAddress as Address,
      abi: MockFOXToken.abi,
      account: address,
      functionName: 'makeItRain',
      args: [address, parseUnits('10000', foxDecimals)],
    });

    await publicClient.waitForTransactionReceipt({ hash: makeItRainTxHash });
    console.log(`10k FOX tokens sent to ${nickname}`);

    const amountToStakeCryptoPrecision = amountToStake
    const amountToStakeCryptoBaseUnit = parseUnits(amountToStakeCryptoPrecision, foxDecimals)

    // Approve FOX to be spent by the FOXStaking contract

    const approveTxHash = await walletClient.writeContract({
      address: mockFoxtokenContractAddress as Address,
      abi: MockFOXToken.abi,
      account: address,
      functionName: 'approve',
      args: [mockFoxStakingContractAddress, amountToStakeCryptoBaseUnit],
    });
    const { transactionHash } = await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

    console.log(`Granted allowance for ${amountToStakeCryptoPrecision} FOX tokens to be spent by FOXStaking contract: ${transactionHash}`);

    const stakeTxHash = await walletClient.writeContract({
      address: mockFoxStakingContractAddress as Address,
      abi: FoxStaking.abi,
      account: address,
      functionName: 'stake',
      args: [amountToStakeCryptoBaseUnit, runeAddress],
    });

    const { transactionHash: stakeTransactionHash } = await publicClient.waitForTransactionReceipt({ hash: stakeTxHash });
    console.log(`Staked ${amountToStakeCryptoPrecision} FOX from ${nickname} to FOXStaking contract: ${stakeTransactionHash}`);

    const stakedBalance = await publicClient.readContract({
      address: mockFoxStakingContractAddress as Address,
      abi: FoxStaking.abi,
      functionName: 'balanceOf',
      args: [address],
    }) as number

    console.log(`${nickname}'s staked balance: ${formatUnits(BigInt(stakedBalance), foxDecimals)} FOX`);
    })

    await Promise.all(stakingPromises)
    }
