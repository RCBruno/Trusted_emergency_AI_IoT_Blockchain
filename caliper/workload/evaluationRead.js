'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

class EvaluationReadWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.txIndex = 0;
        this.preloadedRounds = ['R1', 'R2', 'R3', 'R4', 'R5'];
    }

    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        this.contractId = roundArguments.contractId;
    }

    async submitTransaction() {
        this.txIndex++;
        // Alternate between sensor reads and evaluation reads
        const isEvalRead = this.txIndex % 3 === 0;

        let request;
        if (isEvalRead) {
            request = {
                contractId: this.contractId,
                readOnly: true,
                method: 'queryEvaluationsByAgent',
                args: ['COORDINATOR_AGENT_001'],
            };
        } else {
            const sid = `S${(this.txIndex % 7) + 1}_W0`;
            request = {
                contractId: this.contractId,
                readOnly: true,
                method: 'querySensorData',
                args: [sid, '', ''],
            };
        }

        await this.sutAdapter.sendRequests(request);
    }

    async cleanupWorkloadModule() {}
}

function createWorkloadModule() {
    return new EvaluationReadWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
