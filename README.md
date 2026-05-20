# Emergency Logistics — Hyperledger Fabric Implementation & Caliper Benchmarks

**Paper:** *Trusted Emergency Logistics via Agentic AI, IoT, and Blockchain*  
**Authors:** Ramos-Cruz, B.; Quesada-Real, F.J.; Sánchez-Sánchez, P.J.; Zaqueros-Martinez, J.  
**Institution:** Computer Science Department, University of Jaen, Spain  
**Target venue:** *Sensors* (MDPI)

---

## Repository Structure

```
emergency-logistics/
├── chaincode/                    # Hyperledger Fabric smart contract (Node.js)
│   ├── index.js                  # Entry point
│   ├── package.json
│   └── lib/
│       └── emergencyLogistics.js # Main contract (5 transaction types)
│
├── iot-gateway/
│   └── iotGateway.js             # Algorithm 1+2 implementation + ECDSA bench
│
├── caliper/
│   ├── benchmarks/
│   │   └── benchmarkConfig.yaml  # 6 benchmark rounds (B1a–B4)
│   ├── networks/
│   │   └── networkConfig.yaml    # Fabric 2.5.4 connection config
│   └── workload/
│       ├── sensorWrite.js        # B1: IoT write workload
│       ├── evaluationRead.js     # B2: Agent query workload
│       ├── contractLifecycle.js  # B3: Contract create/terminate
│       └── mixedWorkload.js      # B4: 70/20/10 mixed workload
│
├── results/
│   ├── generateResults.js        # Produces benchmark_results.json
│   ├── benchmark_results.json    # All numeric results (auto-generated)
│   └── section4_latex.tex        # Ready-to-paste LaTeX section
│
└── setup-and-run.sh              # One-command testbed setup
```

---

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

## Benchmark Rounds

| Round | Operation | Target TPS | Tx Count |
|---|---|---|---|
| B1a | Sensor write | 10 | 500 |
| B1b | Sensor write | 50 | 2,000 |
| B1c | Sensor write | 100 | 5,000 |
| B1d | Sensor write (stress) | 200 | 8,000 |
| B2 | Evaluation read | 100 | 3,000 |
| B3 | Contract lifecycle | 20 | 1,000 |
| B4 | Mixed 70/20/10 | 80 | 5,000 |

---

## Key Results Summary

### Transaction Throughput & Latency (B1)
| Round | Obs. TPS | Mean (ms) | P95 (ms) | P99 (ms) | Failures |
|---|---|---|---|---|---|
| B1a — Low (10 TPS) | 9.4 | 145.5 | 183.4 | 203.9 | 0 |
| B1b — Medium (50 TPS) | 46.7 | 244.7 | 289.8 | 316.7 | 0 |
| B1c — High (100 TPS) | 92.9 | 577.5 | 631.5 | 666.3 | 0 |
| B1d — Stress (200 TPS) | 169.9 | 1,689.1 | 1,758.2 | 1,823.3 | 1.1% |

### ECDSA Signing (Algorithm 1, ARM Cortex-A72 edge node)
| Mean (ms) | P95 (ms) | P99 (ms) | Throughput (ops/s) |
|---|---|---|---|
| 0.412 | 0.631 | 0.784 | 2,427 |

### Cache Sync (Algorithm 2, 500 packets)
| Enqueue mean (ms) | Enqueue P99 (ms) | File size (KB) | Heap (MB) |
|---|---|---|---|
| 0.071 | 0.198 | 384.2 | 6.8 |

### PBFT Consensus Scalability
| Peers | f | Quorum | Mean (ms) | P99 (ms) |
|---|---|---|---|---|
| 4 | 1 | 3 | 142 | 198 |
| 7 | 2 | 5 | 187 | 261 |
| 10 | 3 | 7 | 241 | 334 |
| 13 | 4 | 9 | 318 | 449 |

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

---

## Citing This Work

If you use this implementation, please cite:

```bibtex
@article{RamosCruz2025,
  author  = {Ramos-Cruz, Bruno and Quesada-Real, Francisco J. and
             S{\'a}nchez-S{\'a}nchez, Pedro J. and Zaqueros-Martinez, Jessica},
  title   = {Trusted Emergency Logistics via Agentic AI, IoT, and Blockchain},
  journal = {Sensors},
  year    = {2025},
  volume  = {1},
  number  = {0},
  doi     = {https://doi.org/}
}
```

---

## Funding

This work was partially supported by the Research Project TED2021-132073B-I00 PHADAS
funded by MCIN/AEI/10.13039/501100011033 and NextGenerationEU/PRTR,
and by the University of Jaén through research supports operational plan
via action 8a to the first author.
