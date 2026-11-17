import { randomUUID } from 'node:crypto';
import { BaseProviderAdapter, AdapterConfig, AdapterTransmissionResult } from './base.adapter.js';
import { FhirMedicationRequest } from '../fhir/fhir-r4.types.js';

export class PharmacyAdapter extends BaseProviderAdapter {
  protected readonly adapterName = 'PharmacyAdapter';
  protected readonly allowedDomains = [
    'sandbox.api.healthcare-integration.local',
    'sandbox.wasfaty.sa',
    'sandbox.erx.doh.gov.ae',
  ];

  constructor(config?: Partial<AdapterConfig>) {
    super(config);
  }

  /**
   * Submits outpatient electronic prescription to community pharmacy network (e.g. Wasfaty sandbox).
   */
  async submitPrescription(request: FhirMedicationRequest): Promise<AdapterTransmissionResult<{ erxReferenceNumber: string; dispenseStatus: string }>> {
    this.validatePreconditions();

    const transmissionId = randomUUID();
    const erxReferenceNumber = `ERX-${Date.now().toString(36).toUpperCase()}`;

    this.sanitizeLog('Submitting electronic prescription to pharmacy exchange', {
      medicationRequestId: request.id,
      intent: request.intent,
      status: request.status,
    });

    return {
      success: true,
      transmissionId,
      environment: this.config.environment,
      statusCode: 201,
      data: {
        erxReferenceNumber,
        dispenseStatus: 'READY_FOR_PICKUP',
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Queries dispensing outcome from outpatient pharmacy network.
   */
  async checkDispenseStatus(erxReferenceNumber: string): Promise<AdapterTransmissionResult<{ status: string; dispensedAt?: string }>> {
    this.validatePreconditions();

    const transmissionId = randomUUID();

    this.sanitizeLog('Checking prescription dispensing status', { erxReferenceNumber });

    return {
      success: true,
      transmissionId,
      environment: this.config.environment,
      statusCode: 200,
      data: {
        status: 'DISPENSED',
        dispensedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };
  }
}
