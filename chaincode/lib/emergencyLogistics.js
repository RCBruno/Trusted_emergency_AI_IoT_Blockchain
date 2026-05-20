'use strict';

const { Contract } = require('fabric-contract-api');
const crypto = require('crypto');

/**
 * EmergencyLogisticsContract
 * Hyperledger Fabric Chaincode for Trusted Emergency Logistics
 * Implements: IoT data anchoring, supplier evaluation recording,
 * contract management, and full audit trail.
 *
 * Paper: "Trusted Emergency Logistics via Agentic AI, IoT, and Blockchain"
 * Authors: Ramos-Cruz et al., University of Jaen, 2025
 */
class EmergencyLogisticsContract extends Contract {

    // ─────────────────────────────────────────────────────────────────────────
    // INITIALIZATION
    // ─────────────────────────────────────────────────────────────────────────

    async initLedger(ctx) {
        console.info('============= Initializing Emergency Logistics Ledger =============');
        const genesis = {
            docType: 'genesis',
            systemVersion: '1.0.0',
            initializedAt: new Date().toISOString(),
            description: 'Emergency Logistics System - Agentic AI + IoT + Blockchain',
        };
        await ctx.stub.putState('GENESIS', Buffer.from(JSON.stringify(genesis)));
        console.info('Ledger initialized successfully.');
        return JSON.stringify(genesis);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // IoT SENSING LAYER — Algorithm 1 / Algorithm 2 on-chain counterpart
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * recordSensorData
     * Anchors a signed IoT sensor packet on the ledger.
     * Implements conflict resolution: timestamp-priority rule (Algorithm 3).
     *
     * @param {String} sid          - Sensor identifier
     * @param {String} signedData   - ECDSA-signed payload (base64)
     * @param {String} metadata     - JSON string: {timestamp, geolocation, confidence, sensorType}
     * @param {String} vlocal       - Monotonic local version counter (string-encoded integer)
     * @param {String} publicKey    - Sender's public key (PEM, base64-encoded)
     */
    async recordSensorData(ctx, sid, signedData, metadata, vlocal, publicKey) {
        const t_start = Date.now();

        // Parse and validate metadata
        let meta;
        try {
            meta = JSON.parse(metadata);
        } catch (e) {
            throw new Error(`VALIDATION_FAILED: metadata is not valid JSON — ${e.message}`);
        }

        if (!meta.timestamp || !meta.geolocation || meta.confidence === undefined) {
            throw new Error('VALIDATION_FAILED: metadata missing required fields (timestamp, geolocation, confidence)');
        }

        // Verify ECDSA signature
        const sigValid = this._verifySignature(meta.timestamp + sid + meta.geolocation, signedData, publicKey);
        if (!sigValid) {
            throw new Error('VALIDATION_FAILED: ECDSA signature verification failed');
        }

        const compositeKey = ctx.stub.createCompositeKey('sensor', [sid, meta.timestamp]);

        // Conflict resolution — Algorithm 3 (TryAnchor)
        const existing = await ctx.stub.getState(compositeKey);
        if (existing && existing.length > 0) {
            const existingRecord = JSON.parse(existing.toString());
            const existingVersion = parseInt(existingRecord.vlocal, 10);
            const incomingVersion = parseInt(vlocal, 10);

            if (existingRecord.timestamp === meta.timestamp && existingVersion >= incomingVersion) {
                // Reject duplicate — older or equal version
                await ctx.stub.setEvent('CONFLICT_REJECTED', Buffer.from(JSON.stringify({
                    sid, timestamp: meta.timestamp, reason: 'duplicate_or_older_version'
                })));
                return JSON.stringify({ status: 'CONFLICT_REJECTED', sid, timestamp: meta.timestamp });
            }
        }

        // Build on-chain record
        const sensorRecord = {
            docType: 'sensorReading',
            sid,
            signedData,
            publicKey,
            vlocal: parseInt(vlocal, 10),
            timestamp: meta.timestamp,
            geolocation: meta.geolocation,
            confidence: meta.confidence,
            sensorType: meta.sensorType || 'GENERIC',
            anchoredAt: new Date().toISOString(),
            txId: ctx.stub.getTxID(),
            processingTimeMs: Date.now() - t_start,
        };

        await ctx.stub.putState(compositeKey, Buffer.from(JSON.stringify(sensorRecord)));

        // Emit indexed event for agent queries
        await ctx.stub.setEvent('SENSOR_DATA_RECORDED', Buffer.from(JSON.stringify({
            sid,
            timestamp: meta.timestamp,
            geolocation: meta.geolocation,
            sensorType: sensorRecord.sensorType,
            txId: sensorRecord.txId,
        })));

        return JSON.stringify({ status: 'SUCCESS', txId: sensorRecord.txId, processingTimeMs: sensorRecord.processingTimeMs });
    }

    /**
     * querySensorData
     * Retrieve sensor records for a given sensor and optional time range.
     */
    async querySensorData(ctx, sid, startTime, endTime) {
        const iterator = await ctx.stub.getStateByPartialCompositeKey('sensor', [sid]);
        const results = [];

        while (true) {
            const res = await iterator.next();
            if (res.value && res.value.value.toString()) {
                const record = JSON.parse(res.value.value.toString('utf8'));
                if (startTime && endTime) {
                    if (record.timestamp >= startTime && record.timestamp <= endTime) {
                        results.push(record);
                    }
                } else {
                    results.push(record);
                }
            }
            if (res.done) { await iterator.close(); break; }
        }
        return JSON.stringify(results);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AGENTIC REASONING LAYER — Decision recording and supplier contracts
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * recordSupplierEvaluation
     * Stores the MCDM (Fuzzy TOPSIS) evaluation results for a decision round.
     * LLM-generated explanation is stored alongside the structured scores.
     *
     * @param {String} roundId          - Evaluation round identifier
     * @param {String} agentId          - Coordinating agent identifier
     * @param {String} suppliersJSON    - JSON array of {supplierId, scores, topsisScore, rank}
     * @param {String} weightsJSON      - JSON: {C1, C2, C3, C4} BWM-derived weights
     * @param {String} llmExplanation   - Natural language justification from LLM
     * @param {String} selectedSupplier - Winner supplier ID
     */
    async recordSupplierEvaluation(ctx, roundId, agentId, suppliersJSON, weightsJSON, llmExplanation, selectedSupplier) {
        const key = `EVAL_${roundId}_${agentId}`;

        let suppliers, weights;
        try {
            suppliers = JSON.parse(suppliersJSON);
            weights   = JSON.parse(weightsJSON);
        } catch (e) {
            throw new Error(`VALIDATION_FAILED: invalid JSON in suppliers or weights — ${e.message}`);
        }

        const evaluation = {
            docType: 'supplierEvaluation',
            roundId,
            agentId,
            suppliers,
            weights,
            llmExplanation,
            selectedSupplier,
            recordedAt: new Date().toISOString(),
            txId: ctx.stub.getTxID(),
        };

        await ctx.stub.putState(key, Buffer.from(JSON.stringify(evaluation)));

        await ctx.stub.setEvent('EVALUATION_RECORDED', Buffer.from(JSON.stringify({
            roundId, agentId, selectedSupplier, txId: evaluation.txId
        })));

        return JSON.stringify({ status: 'SUCCESS', key, txId: evaluation.txId });
    }

    /**
     * createLogisticsContract
     * Records an agreed logistics contract between coordinator and supplier agents.
     *
     * @param {String} contractId       - Unique contract identifier
     * @param {String} coordinatorId    - Coordinator agent ID
     * @param {String} supplierId       - Supplier agent ID
     * @param {String} termsJSON        - JSON: {quantity, unitCost, deliveryTime, resource, geolocation}
     * @param {String} roundId          - Decision round that generated this contract
     */
    async createLogisticsContract(ctx, contractId, coordinatorId, supplierId, termsJSON, roundId) {
        const existing = await ctx.stub.getState(`CONTRACT_${contractId}`);
        if (existing && existing.length > 0) {
            throw new Error(`CONTRACT_EXISTS: contractId ${contractId} already exists`);
        }

        let terms;
        try { terms = JSON.parse(termsJSON); }
        catch (e) { throw new Error(`VALIDATION_FAILED: invalid terms JSON — ${e.message}`); }

        const contract = {
            docType: 'logisticsContract',
            contractId,
            coordinatorId,
            supplierId,
            terms,
            roundId,
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            terminatedAt: null,
            terminationReason: null,
            txId: ctx.stub.getTxID(),
        };

        await ctx.stub.putState(`CONTRACT_${contractId}`, Buffer.from(JSON.stringify(contract)));
        await ctx.stub.setEvent('CONTRACT_CREATED', Buffer.from(JSON.stringify({
            contractId, coordinatorId, supplierId, roundId, txId: contract.txId
        })));

        return JSON.stringify({ status: 'SUCCESS', contractId, txId: contract.txId });
    }

    /**
     * terminateContract
     * Marks a contract as TERMINATED with an auditable reason (e.g., delivery delay).
     */
    async terminateContract(ctx, contractId, reason) {
        const key = `CONTRACT_${contractId}`;
        const existing = await ctx.stub.getState(key);
        if (!existing || existing.length === 0) {
            throw new Error(`CONTRACT_NOT_FOUND: ${contractId}`);
        }

        const contract = JSON.parse(existing.toString());
        if (contract.status === 'TERMINATED') {
            throw new Error(`CONTRACT_ALREADY_TERMINATED: ${contractId}`);
        }

        contract.status = 'TERMINATED';
        contract.terminatedAt = new Date().toISOString();
        contract.terminationReason = reason;
        contract.terminationTxId = ctx.stub.getTxID();

        await ctx.stub.putState(key, Buffer.from(JSON.stringify(contract)));
        await ctx.stub.setEvent('CONTRACT_TERMINATED', Buffer.from(JSON.stringify({
            contractId, reason, txId: contract.terminationTxId
        })));

        return JSON.stringify({ status: 'TERMINATED', contractId, reason });
    }

    /**
     * getContract
     * Returns the full contract record (active or terminated) for audit.
     */
    async getContract(ctx, contractId) {
        const data = await ctx.stub.getState(`CONTRACT_${contractId}`);
        if (!data || data.length === 0) {
            throw new Error(`CONTRACT_NOT_FOUND: ${contractId}`);
        }
        return data.toString();
    }

    /**
     * getContractHistory
     * Returns the full modification history of a contract (Fabric native history API).
     */
    async getContractHistory(ctx, contractId) {
        const iterator = await ctx.stub.getHistoryForKey(`CONTRACT_${contractId}`);
        const history = [];

        while (true) {
            const res = await iterator.next();
            if (res.value) {
                history.push({
                    txId: res.value.txId,
                    timestamp: res.value.timestamp,
                    isDelete: res.value.isDelete,
                    value: res.value.value.toString('utf8'),
                });
            }
            if (res.done) { await iterator.close(); break; }
        }
        return JSON.stringify(history);
    }

    /**
     * queryEvaluationsByAgent
     * Rich query: retrieve all evaluation rounds for a given agent (CouchDB required).
     */
    async queryEvaluationsByAgent(ctx, agentId) {
        const query = JSON.stringify({
            selector: { docType: 'supplierEvaluation', agentId },
            sort: [{ recordedAt: 'asc' }],
        });
        const iterator = await ctx.stub.getQueryResult(query);
        const results = [];

        while (true) {
            const res = await iterator.next();
            if (res.value && res.value.value.toString()) {
                results.push(JSON.parse(res.value.value.toString('utf8')));
            }
            if (res.done) { await iterator.close(); break; }
        }
        return JSON.stringify(results);
    }

    /**
     * queryActiveContracts
     * Rich query: retrieve all ACTIVE contracts (CouchDB required).
     */
    async queryActiveContracts(ctx) {
        const query = JSON.stringify({
            selector: { docType: 'logisticsContract', status: 'ACTIVE' },
        });
        const iterator = await ctx.stub.getQueryResult(query);
        const results = [];

        while (true) {
            const res = await iterator.next();
            if (res.value && res.value.value.toString()) {
                results.push(JSON.parse(res.value.value.toString('utf8')));
            }
            if (res.done) { await iterator.close(); break; }
        }
        return JSON.stringify(results);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CALIPER BENCHMARK TARGETS — lightweight read/write for throughput tests
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * putSensorPing  — used by Caliper write workload
     * Minimal write: anchor a key-value sensor ping.
     */
    async putSensorPing(ctx, sid, payload) {
        const key = `PING_${sid}_${ctx.stub.getTxID()}`;
        await ctx.stub.putState(key, Buffer.from(payload));
        return key;
    }

    /**
     * getSensorPing — used by Caliper read workload
     */
    async getSensorPing(ctx, key) {
        const data = await ctx.stub.getState(key);
        if (!data || data.length === 0) return '{}';
        return data.toString();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERNAL HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * _verifySignature
     * Verifies ECDSA (secp256k1 / prime256v1) signature.
     * In production, uses the sender's enrolled certificate public key.
     * Here we support both PEM and a passthrough flag for simulation.
     */
    _verifySignature(payload, signatureB64, publicKeyB64) {
        // If publicKey is the literal string 'SIMULATION', skip crypto check
        // (used for Caliper throughput benchmarks to isolate consensus latency)
        if (publicKeyB64 === 'SIMULATION') return true;

        try {
            const pubKeyPem = Buffer.from(publicKeyB64, 'base64').toString('utf8');
            const verify = crypto.createVerify('SHA256');
            verify.update(payload);
            return verify.verify(pubKeyPem, Buffer.from(signatureB64, 'base64'));
        } catch (e) {
            console.error('Signature verification error:', e.message);
            return false;
        }
    }
}

module.exports = EmergencyLogisticsContract;
