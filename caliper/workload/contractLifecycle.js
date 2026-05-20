'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

class ContractLifecycleWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.txIndex = 0;
        this.createdContracts = [];
        this.phase = 'create'; // alternates create -> terminate
    }

    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        this.contractId   = roundArguments.contractId;
        this.coordinatorId = roundArguments.coordinatorId || 'COORDINATOR_001';
        this.workerIndex  = workerIndex;
    }

    async submitTransaction() {
        this.txIndex++;
        let request;

        if (this.phase === 'create' || this.createdContracts.length === 0) {
            const cid = `CTR_W${this.workerIndex}_${this.txIndex}_${Date.now()}`;
            const supplierId = `S${(this.txIndex % 7) + 1}`;
            const terms = JSON.stringify({
                quantity: 10000,
                unitCost: (2.5 + Math.random()).toFixed(2),
                deliveryTime: `${2 + (this.txIndex % 4)}h`,
                resource: 'water-5L',
                geolocation: '37.7749,-3.7852',
            });

            request = {
                contractId: this.contractId,
                readOnly: false,
                method: 'createLogisticsContract',
                args: [cid, this.coordinatorId, supplierId, terms, `R${(this.txIndex % 5) + 1}`],
            };

            this.createdContracts.push(cid);
            this.phase = 'terminate';
        } else {
            const cid = this.createdContracts.shift();
            request = {
                contractId: this.contractId,
                readOnly: false,
                method: 'terminateContract',
                args: [cid, 'delivery_time_exceeded'],
            };
            this.phase = 'create';
        }

        await this.sutAdapter.sendRequests(request);
    }

    async cleanupWorkloadModule() {}
}

function createWorkloadModule() {
    return new ContractLifecycleWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
