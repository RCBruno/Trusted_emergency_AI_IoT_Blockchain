'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const crypto = require('crypto');

class SensorWriteWorkload extends WorkloadModuleBase {
    constructor() {
        super();
        this.contractId = '';
        this.sensorCount = 7;
        this.txIndex = 0;
        this.keyPair = null;
    }

    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        this.contractId = roundArguments.contractId;
        this.sensorCount = roundArguments.sensorCount || 7;
        this.workerIndex = workerIndex;

        // Generate ECDSA key pair once per worker
        const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
            namedCurve: 'prime256v1',
            publicKeyEncoding:  { type: 'spki',  format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
        this.privateKey = privateKey;
        this.publicKeyB64 = Buffer.from(publicKey).toString('base64');
    }

    async submitTransaction() {
        this.txIndex++;
        const sid = `S${(this.txIndex % this.sensorCount) + 1}_W${this.workerIndex}`;
        const timestamp = new Date().toISOString();
        const geolocation = `${(37.77 + Math.random() * 0.1).toFixed(4)},${(-3.78 + Math.random() * 0.1).toFixed(4)}`;
        const confidence = (0.85 + Math.random() * 0.14).toFixed(3);
        const sensorType = ['RFID', 'GPS', 'TEMPERATURE', 'HUMIDITY'][this.txIndex % 4];

        const payload = `${timestamp}|${sid}|${geolocation}`;
        const sign = crypto.createSign('SHA256');
        sign.update(payload);
        const signature = sign.sign(this.privateKey, 'base64');

        const metadata = JSON.stringify({ timestamp, geolocation, confidence: parseFloat(confidence), sensorType });
        const vlocal = String(this.txIndex + this.workerIndex * 100000);

        const request = {
            contractId: this.contractId,
            readOnly: false,
            method: 'recordSensorData',
            args: [sid, signature, metadata, vlocal, this.publicKeyB64],
        };

        await this.sutAdapter.sendRequests(request);
    }

    async cleanupWorkloadModule() {}
}

function createWorkloadModule() {
    return new SensorWriteWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
