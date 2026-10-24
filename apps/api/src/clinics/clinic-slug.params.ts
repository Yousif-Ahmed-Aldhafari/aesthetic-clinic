import { IsString, Matches, MaxLength } from 'class-validator';

export class ClinicSlugParams {
  @IsString()
  @MaxLength(63)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
}
