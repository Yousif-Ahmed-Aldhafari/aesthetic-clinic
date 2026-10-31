export type PhotoCategory = 'BEFORE' | 'AFTER' | 'FOLLOW_UP';
export type PhotoSessionStatus = 'ACTIVE' | 'ARCHIVED';

export interface PhotoAnnotationDto {
  id: string;
  annotationType: string;
  geometryJson: string | null;
  comment: string;
  createdAt: string;
  author: {
    user: {
      name: string;
    };
  };
}

export interface ClinicalPhotoDto {
  id: string;
  category: PhotoCategory;
  bodyArea: string;
  caption: string | null;
  takenAt: string;
  mimeType: string;
  width: number;
  height: number;
  sha256Digest: string;
  createdAt: string;
  isArchived?: boolean;
  archivedAt?: string | null;
  archivedReason?: string | null;
  version?: number;
  annotations?: PhotoAnnotationDto[];
}

export interface ClinicalPhotoSessionDto {
  id: string;
  patientId: string;
  sessionDate: string;
  notes: string | null;
  createdAt: string;
  clinician: {
    id: string;
    user: {
      name: string;
    };
  };
  consent: {
    id: string;
    purpose: string;
    status: string;
    expiresAt?: string | null;
  };
  encounter?: { id: string; createdAt: string } | null;
  procedureExecution?: { id: string; procedureNameArSnapshot: string; status: string } | null;
  photos: ClinicalPhotoDto[];
}

export interface PhotoComparisonGroupDto {
  id: string;
  title: string;
  notes: string | null;
  createdAt: string;
  clinician: {
    user: {
      name: string;
    };
  };
  beforePhoto: {
    id: string;
    category: PhotoCategory;
    bodyArea: string;
    takenAt: string;
    sha256Digest?: string;
  };
  afterPhoto: {
    id: string;
    category: PhotoCategory;
    bodyArea: string;
    takenAt: string;
    sha256Digest?: string;
  };
}

export interface CreatePhotoSessionInput {
  patientId: string;
  consentId: string;
  sessionDate: string;
  encounterId?: string;
  treatmentPlanId?: string;
  treatmentPlanItemId?: string;
  procedureExecutionId?: string;
  notes?: string;
}

export interface CreateComparisonInput {
  title: string;
  beforePhotoId: string;
  afterPhotoId: string;
  notes?: string;
}

export interface CreateAnnotationInput {
  annotationType: string;
  geometryJson?: string;
  comment: string;
}

export interface ArchivePhotoInput {
  expectedVersion: number;
  reason: string;
}

export class PhotoApi {
  constructor(
    private readonly clinicId: string,
    private readonly csrfToken: string,
    private readonly onAuthError?: (err: unknown) => void,
  ) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const res = await fetch(`/api/v1/clinics/${this.clinicId}/clinical/${path}`, {
      ...options,
      credentials: 'same-origin',
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.method && options.method !== 'GET' ? { 'X-CSRF-Token': this.csrfToken } : {}),
        ...options.headers,
      },
    });

    if (res.status === 401 || res.status === 403) {
      if (res.status === 401 && this.onAuthError) this.onAuthError(new Error('SESSION_EXPIRED'));
    }

    if (!res.ok) {
      let message = 'حدث خطأ في معالجة طلب الصور السريرية';
      try {
        const body = (await res.json()) as { message?: string | string[] };
        if (body.message) {
          message = Array.isArray(body.message) ? body.message.join('، ') : body.message;
        }
      } catch {}
      throw new Error(message);
    }

    return (await res.json()) as T;
  }

  async listSessions(patientId: string, signal?: AbortSignal): Promise<ClinicalPhotoSessionDto[]> {
    const data = await this.request<{ items: ClinicalPhotoSessionDto[] }>(`patients/${patientId}/photo-sessions`, {
      method: 'GET',
      signal,
    });
    return data.items;
  }

  async createSession(input: CreatePhotoSessionInput): Promise<ClinicalPhotoSessionDto> {
    return this.request<ClinicalPhotoSessionDto>('photo-sessions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async uploadPhoto(
    sessionId: string,
    file: File,
    category: PhotoCategory,
    bodyArea: string,
    caption?: string,
  ): Promise<ClinicalPhotoDto> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', category);
    fd.append('bodyArea', bodyArea);
    if (caption) fd.append('caption', caption);

    return this.request<ClinicalPhotoDto>(`photo-sessions/${sessionId}/photos`, {
      method: 'POST',
      body: fd,
    });
  }

  async getPhotoMetadata(photoId: string, signal?: AbortSignal): Promise<ClinicalPhotoDto> {
    return this.request<ClinicalPhotoDto>(`photos/${photoId}`, {
      method: 'GET',
      signal,
    });
  }

  async fetchDecryptedBlob(photoId: string, variant: 'thumbnail' | 'original', signal?: AbortSignal): Promise<Blob> {
    const res = await fetch(`/api/v1/clinics/${this.clinicId}/clinical/photos/${photoId}/${variant}`, {
      method: 'GET',
      credentials: 'same-origin',
      signal,
    });

    if (!res.ok) {
      throw new Error(`تعذر تحميل الصورة السريرية (${res.status})`);
    }

    return res.blob();
  }

  async listComparisons(patientId: string, signal?: AbortSignal): Promise<PhotoComparisonGroupDto[]> {
    const data = await this.request<{ items: PhotoComparisonGroupDto[] }>(`patients/${patientId}/photo-comparisons`, {
      method: 'GET',
      signal,
    });
    return data.items;
  }

  async createComparison(patientId: string, input: CreateComparisonInput): Promise<PhotoComparisonGroupDto> {
    return this.request<PhotoComparisonGroupDto>(`patients/${patientId}/photo-comparisons`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async listAnnotations(photoId: string, signal?: AbortSignal): Promise<PhotoAnnotationDto[]> {
    const data = await this.request<{ items: PhotoAnnotationDto[] }>(`photos/${photoId}/annotations`, {
      method: 'GET',
      signal,
    });
    return data.items;
  }

  async addAnnotation(photoId: string, input: CreateAnnotationInput): Promise<PhotoAnnotationDto> {
    return this.request<PhotoAnnotationDto>(`photos/${photoId}/annotations`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async archivePhoto(photoId: string, input: ArchivePhotoInput): Promise<{ success: boolean; archivedAt: string }> {
    return this.request<{ success: boolean; archivedAt: string }>(`photos/${photoId}/archive`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async listConsents(patientId: string, signal?: AbortSignal): Promise<Array<{ id: string; purpose: string; status: string; expiresAt: string | null }>> {
    const res = await fetch(`/api/v1/clinics/${this.clinicId}/clinical/patients/${patientId}/consents`, {
      method: 'GET',
      credentials: 'same-origin',
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items: Array<{ id: string; purpose: string; status: string; expiresAt: string | null }> };
    return data.items || [];
  }
}
