import { createHash } from 'node:crypto';
import type {
  IntegrationMode,
  RegulatoryDocumentType,
  RegulatoryFramework,
  RegulatorySubmissionStatus,
} from '../generated/prisma/client.js';

export interface RegulatoryCanonicalInput {
  clinicId: string;
  framework: RegulatoryFramework;
  countryCode: string;
  documentType: RegulatoryDocumentType;
  documentNumber: string;
  taxRegistrationNumber: string;
  legalEntityName: string;
  currency: string;
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
  issuedAtIso: string;
  invoiceNumber?: string | null;
  invoiceId: string;
}

export interface RegulatoryPreparedDocument {
  canonicalHash: string;
  payloadJson: Record<string, unknown>;
}

export interface RegulatorySubmissionOutcome {
  status: RegulatorySubmissionStatus;
  externalReferenceId: string | null;
  responseCode: string;
  responseMessage: string;
  disclaimer: string;
}

export interface RegulatoryAdapter {
  readonly framework: RegulatoryFramework;
  prepareDocument(input: RegulatoryCanonicalInput): RegulatoryPreparedDocument;
  submitDocument(
    doc: RegulatoryPreparedDocument,
    mode: IntegrationMode,
  ): RegulatorySubmissionOutcome;
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`).join(',')}}`;
}

class SaZatcaAdapter implements RegulatoryAdapter {
  readonly framework: RegulatoryFramework = 'SA_ZATCA';

  prepareDocument(input: RegulatoryCanonicalInput): RegulatoryPreparedDocument {
    const payloadJson: Record<string, unknown> = {
      schemaVersion: 'lamssa-zatca-foundation-v1',
      framework: 'SA_ZATCA',
      countryCode: input.countryCode,
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      seller: {
        legalEntityName: input.legalEntityName,
        vatRegistrationNumber: input.taxRegistrationNumber,
      },
      totals: {
        currency: input.currency,
        netMinor: input.netMinor,
        taxMinor: input.taxMinor,
        grossMinor: input.grossMinor,
      },
      issuedAt: input.issuedAtIso,
      invoiceNumber: input.invoiceNumber ?? null,
      invoiceId: input.invoiceId,
      clearanceCapability: 'FOUNDATION_UNCONFIGURED_FOR_PHASE2_CLEARANCE',
    };
    const canonicalHash = createHash('sha256')
      .update(canonicalStringify(payloadJson), 'utf8')
      .digest('hex');
    return { canonicalHash, payloadJson };
  }

  submitDocument(doc: RegulatoryPreparedDocument, mode: IntegrationMode): RegulatorySubmissionOutcome {
    if (mode === 'LIVE') {
      return {
        status: 'NOT_CONFIGURED',
        externalReferenceId: null,
        responseCode: 'ZATCA_LIVE_CLEARANCE_NOT_CONFIGURED',
        responseMessage: 'Live ZATCA Fatoora Phase 2 cryptographic CSID signing and clearance transport are not enabled.',
        disclaimer: 'No live regulatory clearance was performed.',
      };
    }
    return {
      status: 'MOCK_SUBMITTED',
      externalReferenceId: `mock_zatca_${doc.canonicalHash.slice(0, 16)}`,
      responseCode: 'MOCK_ACCEPTED',
      responseMessage: 'Recorded deterministic sandbox mock submission for ZATCA-compatible payload structure.',
      disclaimer: 'Sandbox mock submission only; NOT cleared or reported to ZATCA Fatoora.',
    };
  }
}

class GenericRegulatoryAdapter implements RegulatoryAdapter {
  constructor(readonly framework: RegulatoryFramework) {}

  prepareDocument(input: RegulatoryCanonicalInput): RegulatoryPreparedDocument {
    const payloadJson: Record<string, unknown> = {
      schemaVersion: 'lamssa-regulatory-foundation-v1',
      framework: this.framework,
      countryCode: input.countryCode,
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      seller: {
        legalEntityName: input.legalEntityName,
        taxRegistrationNumber: input.taxRegistrationNumber,
      },
      totals: {
        currency: input.currency,
        netMinor: input.netMinor,
        taxMinor: input.taxMinor,
        grossMinor: input.grossMinor,
      },
      issuedAt: input.issuedAtIso,
      invoiceNumber: input.invoiceNumber ?? null,
      invoiceId: input.invoiceId,
    };
    const canonicalHash = createHash('sha256')
      .update(canonicalStringify(payloadJson), 'utf8')
      .digest('hex');
    return { canonicalHash, payloadJson };
  }

  submitDocument(doc: RegulatoryPreparedDocument, mode: IntegrationMode): RegulatorySubmissionOutcome {
    if (mode === 'LIVE' || this.framework === 'NOT_CONFIGURED') {
      return {
        status: 'NOT_CONFIGURED',
        externalReferenceId: null,
        responseCode: 'REGULATORY_LIVE_TRANSPORT_NOT_CONFIGURED',
        responseMessage: `Live regulatory submission adapter for ${this.framework} is not enabled.`,
        disclaimer: 'No live regulatory filing was performed.',
      };
    }
    return {
      status: 'MOCK_SUBMITTED',
      externalReferenceId: `mock_reg_${doc.canonicalHash.slice(0, 16)}`,
      responseCode: 'MOCK_ACCEPTED',
      responseMessage: `Recorded deterministic sandbox mock submission for ${this.framework}.`,
      disclaimer: 'Sandbox mock submission only; NOT filed with any government tax authority.',
    };
  }
}

const REGULATORY_ADAPTERS: Readonly<Record<RegulatoryFramework, RegulatoryAdapter>> = {
  NOT_CONFIGURED: new GenericRegulatoryAdapter('NOT_CONFIGURED'),
  SA_ZATCA: new SaZatcaAdapter(),
  AE_FTA: new GenericRegulatoryAdapter('AE_FTA'),
  GENERIC_TAX_INVOICE: new GenericRegulatoryAdapter('GENERIC_TAX_INVOICE'),
};

export function getRegulatoryAdapter(framework: RegulatoryFramework): RegulatoryAdapter {
  return REGULATORY_ADAPTERS[framework];
}
