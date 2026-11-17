import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export class ValidateTerminologyDto {
  @IsString()
  @IsNotEmpty()
  system!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;
}

export enum AdapterSimulationType {
  LAB_ORDER = 'LAB_ORDER',
  IMAGING_ORDER = 'IMAGING_ORDER',
  PHARMACY_PRESCRIPTION = 'PHARMACY_PRESCRIPTION',
  HEALTH_EXCHANGE_BUNDLE = 'HEALTH_EXCHANGE_BUNDLE',
}

export class SimulateAdapterTransmissionDto {
  @IsEnum(AdapterSimulationType)
  adapterType!: AdapterSimulationType;

  @IsOptional()
  @IsString()
  resourceId?: string;
}
