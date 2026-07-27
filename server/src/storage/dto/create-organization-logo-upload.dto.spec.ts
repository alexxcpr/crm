import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateOrganizationLogoUploadDto,
  ORGANIZATION_LOGO_MAX_BYTES,
} from './create-organization-logo-upload.dto';

describe('CreateOrganizationLogoUploadDto', () => {
  const valid = {
    fileName: 'logo.webp',
    mimeType: 'image/webp',
    sizeBytes: ORGANIZATION_LOGO_MAX_BYTES,
    idempotencyKey:
      '946eca1f-e7c4-4b8b-b7f8-c7a277e6a489',
  };

  it('accepta PNG, JPEG si WebP in limita de 2 MB', async () => {
    for (const mimeType of [
      'image/png',
      'image/jpeg',
      'image/webp',
    ]) {
      expect(
        await validate(
          plainToInstance(
            CreateOrganizationLogoUploadDto,
            { ...valid, mimeType },
          ),
        ),
      ).toHaveLength(0);
    }
  });

  it('respinge SVG si fisierele mai mari de 2 MB', async () => {
    const svgErrors = await validate(
      plainToInstance(
        CreateOrganizationLogoUploadDto,
        { ...valid, mimeType: 'image/svg+xml' },
      ),
    );
    const sizeErrors = await validate(
      plainToInstance(
        CreateOrganizationLogoUploadDto,
        {
          ...valid,
          sizeBytes:
            ORGANIZATION_LOGO_MAX_BYTES + 1,
        },
      ),
    );
    expect(svgErrors).not.toHaveLength(0);
    expect(sizeErrors).not.toHaveLength(0);
  });
});
