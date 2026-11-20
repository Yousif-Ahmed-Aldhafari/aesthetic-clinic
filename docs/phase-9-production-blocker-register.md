# Lamssa — Phase 9: Production Blocker Register

**Status:** Official Pre-Production Clearance Register  
**Date:** 2026-11-20  
**Classification:** Critical Platform Governance  
**Mandate:** Code integration into `main` does NOT constitute authorization for live clinical operations. All blockers in this register must be formally cleared and signed off before processing live patient data.

---

## 1. Blocker Classification & Governance

Blockers are categorized into six core domains:
1. **SEC (Security & Cryptography):** Hardware cryptographic custody and secret management.
2. **INFRA (Infrastructure & Resilience):** High-availability clusters, connection pooling, and multi-region networking.
3. **DR (Disaster Recovery & Data Protection):** Verified restoration drills and immutable backup custody.
4. **CLIN (Clinical Governance & Safety):** Medical Director algorithmic sign-off and safety matrix acceptance.
5. **REG (Regulatory & Compliance):** Health authority compliance, e-prescribing, e-invoicing, and insurance clearance.
6. **LIC (Intellectual Property & Licensing):** Commercial outcome instrument licenses.

---

## 2. Production Blockers Register

| Blocker ID | Domain | Severity | Blocker Description | Required Clearance Criteria | Assigned Owner | Clearance Target | Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :---: | :---: |
| **PB-SEC-01** | Security | **CRITICAL** | Dev/Test mock envelope encryption in use; local master key fallback exists. | Full integration with Cloud KMS / HSM (FIPS 140-2 Level 3). Production fail-closed validation verified with zero local master key fallback. | Platform Security Lead | Step 9.3 | **BLOCKED** |
| **PB-SEC-02** | Security | **HIGH** | Secrets injected via static environment variables in staging Docker Compose. | Dynamic secret injection via AWS Secrets Manager / Vault with in-memory mounting and automated rotation. | DevSecOps Lead | Step 9.3 | **BLOCKED** |
| **PB-INFRA-01**| Infrastructure | **CRITICAL** | Local POSIX asset store (`LocalAssetStore`) used for clinic media & documents. | Implementation of production S3/GCS Object Storage adapter with private bucket policies, SSE-KMS, and pre-signed URLs. | Cloud Architect | Step 9.3 | **BLOCKED** |
| **PB-INFRA-02**| Infrastructure | **CRITICAL** | Single-node PostgreSQL without automated failover or PgBouncer connection pooling. | Multi-AZ Primary/Standby PostgreSQL deployment with synchronous replication (RPO=0) and PgBouncer in transaction mode. | PostgreSQL HA Lead | Step 9.4 | **BLOCKED** |
| **PB-INFRA-03**| Infrastructure | **HIGH** | In-memory alerting engine (`AlertingService`) with zero durable external notification. | Integration with durable alert router (Alertmanager, PagerDuty, Opsgenie) with tested on-call escalation and SMS/phone paging. | SRE Lead | Step 9.5 | **BLOCKED** |
| **PB-DR-01** | Resilience | **CRITICAL** | Full database restoration drill skipped in CI/local test suite due to CREATEDB constraint. | Execution of complete end-to-end disaster recovery drill on isolated staging infrastructure with verified RTO < 15m, RPO < 5m, and post-restore RLS audit. | Release Engineer / QA Lead | Step 9.6 | **BLOCKED** |
| **PB-DR-02** | Resilience | **HIGH** | Backups lack WORM immutability and off-site cross-account replication. | Implementation of S3 Object Lock (Compliance Mode) with cross-region, cross-account immutable replication. | Platform Security Lead | Step 9.6 | **BLOCKED** |
| **PB-CLIN-01**| Clinical | **CRITICAL** | Clinical Decision Support (CDS) rules lack formal Medical Director written sign-off. | Formal review and written clinical authorization of all 8 CDS rules, WHO pediatric growth percentiles, and obstetric dating logic. | Medical Director | Step 9.7 | **BLOCKED** |
| **PB-REG-01** | Compliance | **CRITICAL** | Regulatory sandbox credentials only; live integration gateways not authenticated. | Production certificate issuance, cryptographic onboarding, and clearance testing for ZATCA Phase 2, Wasfaty e-prescribing, and Nphies insurance claims. | Regulatory Compliance Lead | Step 9.7 | **BLOCKED** |
| **PB-REG-02** | Compliance | **HIGH** | Clinical data retention schedules not formally approved for specific jurisdiction. | Formal legal approval of data retention policies (10-year adult, pediatric age 18+10, lifetime oncology) under applicable healthcare data protection laws. | Legal & Compliance Officer | Step 9.7 | **BLOCKED** |
| **PB-LIC-01** | Licensing | **MEDIUM** | Proprietary outcome measures (ODI 2.0, QuickDASH) disabled pending commercial license. | Procurement of institutional enterprise license from Mapi Research Trust (ODI 2.0) and IWH (QuickDASH) prior to enabling questionnaire templates. | Commercial Operations Lead | Step 9.7 | **BLOCKED** |

---

## 3. Clearance Protocol & Governance Gates

Each blocker requires:
1. **Technical Evidence:** Automated integration test logs, cryptographic verification reports, or cloud configuration state audits.
2. **Dual-Signoff:** Engineering Lead and Domain Owner (e.g., Medical Director for `PB-CLIN-01`, Legal Officer for `PB-REG-02`).
3. **Immutability:** Clearance certificates archived in `docs/clearance/` with cryptographic hash digests.
