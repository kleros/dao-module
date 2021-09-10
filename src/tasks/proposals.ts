import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers";
import { Contract } from "ethers";
import { task, types } from "hardhat/config";
import { readFileSync } from "fs";
const IPFS = require('ipfs-core');
const all = require('it-all');
const BufferList = require('bl/BufferList');
const { GraphQLClient, gql } = require('graphql-request')

const RealitioArbitratorProxy = require("./../../test/realitio-v-2-1-arbitrator-proxy.json");
const AutoAppealableArbitrator = require("./../../test/auto-appealable-arbitrator.json");

interface Proposal {
    id: string,
    txs: ModuleTransaction[]
}

interface ExtendedProposal extends Proposal {
    txsHashes: string[]
}

interface ModuleTransaction {
    to: string,
    value: string,
    data: string,
    operation: number,
    nonce: number
}

const getProposalDetails = async (module: Contract, path: string): Promise<ExtendedProposal> => {
    const proposal: Proposal = JSON.parse(readFileSync(path, "utf-8"))
    const txsHashes = await Promise.all(proposal.txs.map(async (tx, index) => {
        return await module.getTransactionHash(tx.to, tx.value, tx.data, tx.operation, index)
    }));
    return {
        ...proposal,
        txsHashes
    }
}

task("addProposal", "Adds a proposal question")
        .addParam("module", "Address of the module", undefined, types.string)
        .addParam("proposalFile", "File with proposal information json", "sample_proposal.json", types.inputFile)
        .setAction(async (taskArgs, hardhatRuntime) => {
            const ethers = hardhatRuntime.ethers;
            const Module = await ethers.getContractFactory("DaoModule");
            const module = await Module.attach(taskArgs.module);

            const proposal = await getProposalDetails(module, taskArgs.proposalFile);

            const tx = await module.addProposal(proposal.id, proposal.txsHashes);
            console.log("Transaction:", tx.hash);
        });

task("showProposal", "Shows proposal quesion details")
        .addParam("module", "Address of the module", undefined, types.string)
        .addParam("proposalFile", "File with proposal information json", "sample_proposal.json", types.inputFile)
        .setAction(async (taskArgs, hardhatRuntime) => {
            const ethers = hardhatRuntime.ethers;
            const Module = await ethers.getContractFactory("DaoModule");
            const module = await Module.attach(taskArgs.module);

            const proposal = await getProposalDetails(module, taskArgs.proposalFile);

            const txHashesImages = ethers.utils.solidityPack(["bytes32[]"], [proposal.txsHashes])
            const txHashesHash = ethers.utils.keccak256(txHashesImages)

            console.log("### Proposal ####");
            console.log("ID:", proposal.id);
            console.log("Transactions hashes hash:", txHashesHash);
            console.log("Transactions hashes:", proposal.txsHashes);
            console.log("Transactions:", proposal.txs);
        });

task("executeProposal", "Executes a proposal")
        .addParam("module", "Address of the module", undefined, types.string)
        .addParam("proposalFile", "File with proposal information json", "sample_proposal.json", types.inputFile)
        .setAction(async (taskArgs, hardhatRuntime) => {
            const ethers = hardhatRuntime.ethers;
            const Module = await ethers.getContractFactory("DaoModule");
            const module = await Module.attach(taskArgs.module);

            const proposal = await getProposalDetails(module, taskArgs.proposalFile);

            for (const index in proposal.txs) {
                const moduleTx = proposal.txs[index]
                const tx = await module.executeProposalWithIndex(
                    proposal.id, proposal.txsHashes, moduleTx.to, moduleTx.value, moduleTx.data, moduleTx.operation, index
                );
                console.log("Transaction:", tx.hash);
            }
        });

task("raiseDispute", "Requests arbitration for given question.")
        .addParam("proxy", "Address of the realitio-kleros arbitration proxy", undefined, types.string)
        .addParam("questionid", "Question id in realitio", undefined, types.string)
        .addParam("maxprevious", "If specified, reverts if a bond higher than this was submitted after you sent your transaction.", 0, types.int)
        .setAction(async (taskArgs, hardhatRuntime) => {
            const ethers = hardhatRuntime.ethers;
            const realitioArbitratorProxy = await ethers.getContractFactory(RealitioArbitratorProxy.abi, RealitioArbitratorProxy.bytecode);
            const arbitrationProxy = await realitioArbitratorProxy.attach(taskArgs.proxy);

            const arbitrationCost = await arbitrationProxy.getDisputeFee(taskArgs.questionid);
            await arbitrationProxy.requestArbitration(taskArgs.questionid, taskArgs.maxprevious, {
                value: arbitrationCost
            });
        });

task("reportAnswer", "Requests arbitration for given question.")
        .addParam("module", "Address of the module", undefined, types.string)
        .addParam("proxy", "Address of the realitio-kleros arbitration proxy", undefined, types.string)
        .addParam("oracle", "Address of the oracle (e.g. Realitio)", undefined, types.string)
        .addParam("questionid", "Question id in realitio", "", types.string)
        .addParam(
            "template", 
            "Template that should be used for proposal questions (See https://github.com/realitio/realitio-dapp#structuring-and-fetching-information)", 
            undefined, 
            types.string
        )
        .addParam("proposalFile", "File with proposal information json", "sample_proposal.json", types.inputFile)
        .setAction(async (taskArgs, hardhatRuntime) => {
            const ethers = hardhatRuntime.ethers;
            const realitioArbitratorProxy = await ethers.getContractFactory(RealitioArbitratorProxy.abi, RealitioArbitratorProxy.bytecode);
            const arbitrationProxy = await realitioArbitratorProxy.attach(taskArgs.proxy);

            const realitio = await ethers.getContractAt("Realitio", taskArgs.oracle);

            const Module = await ethers.getContractFactory("DaoModule");
            const module = await Module.attach(taskArgs.module);
            const proposal = await getProposalDetails(module, taskArgs.proposalFile);

            let questionID = taskArgs.questionid;
            if (taskArgs.questionid == "") {
                const question = await module.buildQuestion(proposal.id, proposal.txsHashes);
                const questionTimeout = await module.questionTimeout();
                questionID = await module.getQuestionId(taskArgs.template, question, taskArgs.proxy, questionTimeout, 0, 0);
            }
            let eventFilter = realitio.filters.LogNewAnswer(null, questionID);
            const events = await realitio.queryFilter(eventFilter);
            const lastEvent = events[0].args || { history_hash: null, answer: null, user: null };
            
            let historyHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
            if (events.length > 1) {
                const secondLastEvent = events[1].args || { history_hash: null, answer: null, user: null };
                historyHash = secondLastEvent.history_hash;
            }

            await arbitrationProxy.reportAnswer(questionID, historyHash, lastEvent.answer, lastEvent.user);
        });

task("executeRuling", "Requests arbitration for given question.")
        .addParam("arbitrator", "Address of the arbitrator", undefined, types.string)
        .setAction(async (taskArgs, hardhatRuntime) => {
            const ethers = hardhatRuntime.ethers;
            const autoAppealableArbitrator = await ethers.getContractFactory(AutoAppealableArbitrator.abi, AutoAppealableArbitrator.bytecode);
            const arbitrator = await autoAppealableArbitrator.attach(taskArgs.arbitrator);

            await arbitrator.executeRuling(0);
        });

task("checkProposalHash", "Shows proposal quesion details")
        .addParam("proposalid", "ID of the proposal.", undefined, types.string)
        .setAction(async (taskArgs, hardhatRuntime) => {
            const ethers = hardhatRuntime.ethers;

            // Fetch and parse proposal data from IPFS.
            const ipfs = await IPFS.create()
            const files = await all(ipfs.get(taskArgs.proposalid));
            console.clear();

            const content = new BufferList()
            for await (const chunk of files) {
                content.append(chunk)
            }
            const contentStr = content.toString();
            const cleanedStr = contentStr.substring(contentStr.indexOf("{")).trim();
            const nullChar = String.fromCharCode(0);
            const proposalData = JSON.parse(JSON.parse(cleanedStr.split(nullChar).join("")).msg);

            // Check if proposal has SafeSnap plugin and retrieve the transactions batches.
            const pluginsData = proposalData.payload.metadata.plugins
            let pluginName = "safeSnap";
            let txsBatches;
            if(!pluginsData.hasOwnProperty(pluginName)){
                pluginName = "daoModule";
                if(!pluginsData.hasOwnProperty(pluginName)){
                    throw "Neither safeSnap nor daoModule plugin found in the proposal.";
                }
                txsBatches = [pluginsData[pluginName].txs];
            } else {
                txsBatches = pluginsData[pluginName].txs;
            }

            // Fetch Snapshot's space data and look for the SafeSnap module address.
            const graph = new GraphQLClient("https://hub.snapshot.org/graphql");
            const spaceData = await graph.request(
                gql`
                    query getSpaceData($spaceID: String) {
                        space(id: $spaceID) {
                            plugins
                        }
                    }
                `,
                {
                    spaceID: proposalData.space,
                }
            )
            
            let moduleAddress = spaceData.space.plugins.daoModule.address;
            if (moduleAddress == null) {
                moduleAddress = spaceData.space.plugins.safeSnap.address;
                if (moduleAddress == null) {
                    throw "SafeSnap module address not found";
                }
            }
            const Module = await ethers.getContractFactory("DaoModule");
            const module = await Module.attach(moduleAddress);

            // Calculate proposal hashes.
            console.log()
            console.log("### Proposal ####");
            console.log("ID:", taskArgs.proposalid);
            console.log()
            for (let j = 0; j < txsBatches.length; j++) {
                const txBatch = txsBatches[j];
                const txsHashes = await Promise.all(txBatch.map(async (tx: ModuleTransaction, index: any) => {
                    return await module.getTransactionHash(tx.to, tx.value, tx.data, tx.operation, index)
                }));
                
                // const proposal;
                const txHashesImages = ethers.utils.solidityPack(["bytes32[]"], [txsHashes]);
                const txHashesHash = ethers.utils.keccak256(txHashesImages);
    
                console.log("Batch nr:", j+1);
                console.log("Array of transactions hashes:", txsHashes);
                console.log("Transactions array hash:", txHashesHash);
                console.log();
            }
        });

export { };