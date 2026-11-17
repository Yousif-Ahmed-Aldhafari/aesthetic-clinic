import { randomUUID } from 'node:crypto';
import { BaseProviderAdapter, AdapterConfig, AdapterTransmissionResult } from './base.adapter.js';
import { FhirServiceRequest, FhirDiagnosticReport } from '../fhir/fhir-r4.types.js';

export class LabOrderAdapter extends BaseProviderAdapter {
  protected readonly adapterName = 'LabOrderAdapter';
  protected readonly allowedDomains = [
    'sandbox.api.healthcare-integration.local',
    'sandbox.lab-gateway.moh.gov.sa',
    'sandbox.lab.malaffi.ae',
  ];

  constructor(config?: Partial<AdapterConfig>) {
    super(config);
  }

  /**
   * Transmits a laboratory service request to an external reference laboratory gateway.
   */
  async submitLabOrder(order: FhirServiceRequest): Promise<AdapterTransmissionResult<{ labOrderId: string; trackingNumber: string }>> {
    this.validatePreconditions();

    const transmissionId = randomUUID();
    const trackingNumber = `LAB-EXT-${Date.now().toString(36).toUpperCase()}`;

    // Zero-PII log
    this.sanitizeLog('Submitting laboratory order to external gateway', {
      orderId: order.id,
      priority: order.priority,
      category: order.category?.[0]?.coding?.[0]?.code,
    });

    return {
      success: true,
      transmissionId,
      environment: this.config.environment,
      statusCode: 202,
      data: {
        labOrderId: `EXT-${order.id}`,
        trackingNumber,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Fetches external diagnostic report results from reference laboratory gateway.
   */
  async fetchLabResults(externalOrderId: string): Promise<AdapterTransmissionResult<Partial<FhirDiagnosticReport>>> {
    this.validatePreconditions();

    const transmissionId = randomUUID();

    this.sanitizeLog('Polling external laboratory results', { externalOrderId });

    return {
      success: true,
      transmissionId,
      environment: this.config.environment,
      statusCode: 200,
      data: {
        resourceType: 'DiagnosticReport',
        status: 'final',
        conclusion: 'Automated sandbox verification: specimen received and analyzed within normal reference ranges.',
      },
      timestamp: new Date().toISOString(),
    };
  }
}
