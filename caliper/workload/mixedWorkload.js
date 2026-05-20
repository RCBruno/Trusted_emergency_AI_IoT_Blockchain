'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const crypto = require('crypto');

class MixedWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.txIndex = 0;
        this.activeContracts = [];
    }

    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        this.contractId    = roundArguments.contractId;
        this.sensorCount   = roundArguments.sensorCount   || 7;
        this.writeRatio    = roundArguments.writeRatio    || 0.70;
        this.readRatio     = roundArguments.readRatio     || 0.20;
        // contractRatio is implicitly 1 - write - read
        this.workerIndex   = workerIndex;

        const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
            namedCurve: 'prime256v1',
            publicKeyEncoding:  { type: 'spki',  format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
        this.privateKey    = privateKey;
        this.publicKeyB64  = Buffer.from(publicKey).toString('base64');
    }

    async submitTransaction() {
        this.txIndex++;
        const roll = Math.random();
        let request;

        if (roll < this.writeRatio) {
            // ── Sensor write (70%) ─────────────────────────────────────────
            const sid = `S${(this.txIndex % this.sensorCount) + 1}_W${this.workerIndex}`;
            const timestamp = new Date().toISOString();
            const geolocation = '37.7749,-3.7852';
            const payload = `${timestamp}|${sid}|${geolocation}`;
            const sign = crypto.createSign('SHA256');
            sign.update(payload);
            const signature = sign.sign(this.privateKey, 'base64');
            const metadata  = JSON.stringify({ timestamp, geolocation, confidence: 0.92, sensorType: 'GPS' });

            request = {
                contractId: this.contractId,
                readOnly: false,
                method: 'recordSensorData',
                args: [sid, signature, metadata, String(this.txIndex), this.publicKeyB64],
            };

        } else if (roll < this.writeRatio + this.readRatio) {
            // ── Evaluation read (20%) ──────────────────────────────────────
            request = {
                contractId: this.contractId,
                readOnly: true,
                method: 'queryEvaluationsByAgent',
                args: ['COORDINATOR_AGENT_001'],
            };

        } else {
            // ── Contract operation (10%) ───────────────────────────────────
            if (this.activeContracts.length > 2) {
                const cid = this.activeContracts.shift();
                request = {
                    contractId: this.contractId,
                    readOnly: false,
                    method: 'terminateContract',
                    args: [cid, 'delivery_time_exceeded'],
                };
            } else {
                const cid = `MIX_W${this.workerIndex}_${this.txIndex}_${Date.now()}`;
                const terms = JSON.stringify({
                    quantity: 500, unitCost: '3.20', deliveryTime: '2h',
                    resource: 'medical-kit', geolocation: '37.7749,-3.7852',
                });
                this.activeContracts.push(cid);
                request = {
                    contractId: this.contractId,
                    readOnly: false,
                    method: 'createLogisticsContract',
                    args: [cid, 'COORDINATOR_AGENT_001', `S${(this.txIndex % 7) + 1}`, terms, 'R1'],
                };
            }
        }

        await this.sutAdapter.sendRequests(request);
    }

    async cleanupWorkloadModule() {}
}

function createWorkloadModule() {
    return new MixedWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
