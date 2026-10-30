import { Injectable } from '@nestjs/common';

export type ConsentEligibility =
  | { eligible: true; consentId: string; purpose: string; verifiedAt?: Date | null; validFrom?: Date | null }
  | { eligible: false; reason: 'VERIFIED_CONSENT_REQUIRED' };

@Injectable()
export class ConsentEligibilityService {
  async check(
    clinicId: string,
    patientId: string,
    procedureExecutionId: string,
    tx?: any,
  ): Promise<ConsentEligibility> {
    const client = tx;
    if (!client || typeof client.procedureExecution?.findFirst !== 'function') {
      return { eligible: false, reason: 'VERIFIED_CONSENT_REQUIRED' };
    }

    try {
      const execution = await client.procedureExecution.findFirst({
        where: { id: procedureExecutionId, clinicId, patientId },
        include: {
          treatmentPlanItem: {
            include: {
              revision: {
                select: { treatmentPlanId: true, revisionNumber: true, status: true },
              },
            },
          },
        },
      });

      if (!execution || !execution.treatmentPlanItem || execution.treatmentPlanItem.revision?.status !== 'APPROVED') {
        return { eligible: false, reason: 'VERIFIED_CONSENT_REQUIRED' };
      }

      const procedureCatalogId = execution.treatmentPlanItem.procedureCatalogId;
      const treatmentPlanId = execution.treatmentPlanItem.revision.treatmentPlanId;
      const treatmentPlanItemId = execution.treatmentPlanItemId;

      const now = new Date();

      // Query active procedure consents for this patient.
      // PURPOSE MUST BE PROCEDURE: Photography or marketing consent can never authorize care.
      const candidates = await client.patientConsent.findMany({
        where: {
          clinicId,
          patientId,
          purpose: 'PROCEDURE',
          status: 'ACTIVE',
          procedureCatalogId,
          templateVersion: {
            status: 'PUBLISHED',
          },
          signatureEvidence: {
            isNot: null,
          },
          withdrawal: {
            is: null,
          },
        },
        include: {
          signatureEvidence: true,
          templateVersion: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const consent of candidates) {
        // Scope matching: if treatment plan, revision or item was specified during preparation, enforce exact match
        if (consent.treatmentPlanId && consent.treatmentPlanId !== treatmentPlanId) {
          continue;
        }
        if (consent.treatmentPlanRevisionNumber && consent.treatmentPlanRevisionNumber !== execution.treatmentPlanItem.revision.revisionNumber) {
          continue;
        }
        if (consent.treatmentPlanItemId && consent.treatmentPlanItemId !== treatmentPlanItemId) {
          continue;
        }

        // Clinician verification requirement
        if (!consent.verifiedAt || !consent.verifiedByMembershipId) {
          continue;
        }

        // Time validity
        if (!consent.validFrom || consent.validFrom > now) {
          continue;
        }
        if (consent.expiresAt && consent.expiresAt <= now) {
          continue;
        }

        // Signature evidence completeness
        const ev = consent.signatureEvidence;
        if (!ev || !ev.signatureData || ev.signatureData.length < 4 || !ev.evidenceHashSha256 || ev.evidenceHashSha256.length !== 64) {
          continue;
        }

        return {
          eligible: true,
          consentId: consent.id,
          purpose: consent.purpose,
          verifiedAt: consent.verifiedAt,
          validFrom: consent.validFrom,
        };
      }

      return { eligible: false, reason: 'VERIFIED_CONSENT_REQUIRED' };
    } catch {
      return { eligible: false, reason: 'VERIFIED_CONSENT_REQUIRED' };
    }
  }
}
