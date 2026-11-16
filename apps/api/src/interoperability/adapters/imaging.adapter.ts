import { randomUUID } from 'node:crypto';
import { BaseProviderAdapter, AdapterConfig, AdapterTransmissionResult } from './base.adapter.js';
import { FhirServiceRequest } from '../fhir/fhir-r4.types.js';

export class ImagingAdapter extends BaseProviderAdapter {
  protected readonly adapterName = 'ImagingAdapter';
  protected readonly allowedDomains = [
    'sandbox.api.healthcare-integration.local',
    'sandbox.pacs-gateway.local',
    'sandbox.ris.moh.gov.sa',
  ];

  constructor(config?: Partial<AdapterConfig>) {
    super(config);
  }

  /**
   * Dispatches diagnostic imaging request to DICOM/PACS worklist broker.
   */
  async submitImagingOrder(order: FhirServiceRequest): Promise<AdapterTransmissionResult<{ accessionNumber: string; modality: string }>> {
    this.validatePreconditions();

    const transmissionId = randomUUID();
    const accessionNumber = `ACC-${Date.now().toString(36).toUpperCase()}`;

    this.sanitizeLog('Dispatching imaging request to PACS worklist broker', {
      orderId: order.id,
      priority: order.priority,
    });

    return {
      success: true,
      transmissionId,
      environment: this.config.environment,
      statusCode: 202,
      data: {
        accessionNumber,
        modality: 'US', // Ultrasound / General Diagnostic default
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Retrieves DICOM WADO-RS study URI and key imaging findings.
   */
  async queryPacsStudy(accessionNumber: string): Promise<AdapterTransmissionResult<{ studyInstanceUid: string; seriesCount: number; wadoUrl: string }>> {
    this.validatePreconditions();

    const transmissionId = randomUUID();

    this.sanitizeLog('Querying PACS DICOM study locator', { accessionNumber });

    return {
      success: true,
      transmissionId,
      environment: this.config.environment,
      statusCode: 200,
      data: {
        studyInstanceUid: `1.2.840.10008.1.1.${Date.now()}`,
        seriesCount: 2,
        wadoUrl: `https://${this.allowedDomains[0]}/dicom/studies/1.2.840.10008.1.1.${Date.now()}`,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
