# Emergency Logistics: Hyperledger Fabric Implementation & Caliper Benchmarks

## Quick Start

### Prerequisites
- Docker ≥ 24.0, Docker Compose ≥ 2.20
- Node.js ≥ 18 LTS, npm ≥ 9
- curl, git

### Full testbed (network + chaincode + Caliper)
```bash
chmod +x setup-and-run.sh
./setup-and-run.sh --all
```

### ECDSA + cache micro-benchmarks only
```bash
cd iot-gateway
npm install
node iotGateway.js --benchmark
```

### Generate paper result tables only
```bash
cd results
node generateResults.js
```

### Teardown
```bash
./setup-and-run.sh --teardown
```

---

## Chaincode Transactions

| Function | Type | Purpose |
|---|---|---|
| `initLedger` | Write | Initialise genesis block |
| `recordSensorData` | Write | Algorithm 1: anchor signed IoT packet |
| `querySensorData` | Read | Agent query: sensor readings by SID + time range |
| `recordSupplierEvaluation` | Write | Store Fuzzy TOPSIS results + LLM explanation |
| `createLogisticsContract` | Write | Record negotiated supplier agreement |
| `terminateContract` | Write | Audit-trail contract termination |
| `getContract` | Read | Retrieve contract by ID |
| `getContractHistory` | Read | Full modification history (Fabric history API) |
| `queryEvaluationsByAgent` | Read (rich) | CouchDB: all evaluations for an agent |
| `queryActiveContracts` | Read (rich) | CouchDB: all active contracts |
| `putSensorPing` / `getSensorPing` | Write/Read | Caliper throughput benchmarks |

---





## Network Topology

```
┌─────────────────── emergency-channel ──────────────────────┐
│  Org1MSP          Org2MSP          Org3MSP       Org4MSP  │
│  peer0.org1       peer0.org2       peer0.org3    peer0.org4│
│    │                │                │              │      │
│    └────────────────┴────────────────┴──────────────┘      │
│                         Raft Ordering Service               │
│                    (orderer0, orderer1, orderer2)           │
│                                                             │
│  State DB: CouchDB (rich queries for agent evaluation)      │
└─────────────────────────────────────────────────────────────┘
```

