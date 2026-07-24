import { BadRequestException } from '@nestjs/common';
import PizZip from 'pizzip';
import { writeFileSync } from 'fs';
import { WordDocumentAdapter } from './word-document.adapter';

const NS =
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function makeDocx(
  documentBody: string,
  extraParts: Record<string, string> = {},
): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="${NS}"><w:body>${documentBody}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
  );
  for (const [name, xml] of Object.entries(
    extraParts,
  ))
    zip.file(name, xml);
  return zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
}

function partText(
  buffer: Buffer,
  part = 'word/document.xml',
): string {
  return (
    new PizZip(buffer).file(part)?.asText() ?? ''
  );
}

describe('WordDocumentAdapter', () => {
  const conversion = {
    convertDocxToPdf: jest.fn(),
  };
  const adapter = new WordDocumentAdapter(
    conversion as any,
  );

  beforeEach(() => {
    conversion.convertDocxToPdf.mockReset();
  });

  it('converts the current DOCX into a new PDF document handle payload', async () => {
    const pdf = Buffer.from(
      '%PDF-1.4\nconverted\n%%EOF',
    );
    conversion.convertDocxToPdf.mockResolvedValue(
      {
        buffer: pdf,
        fileName: 'contract.pdf',
      },
    );

    const result = await adapter.execute(
      'convertToPdf',
      {
        document: makeDocx(
          '<w:p><w:r><w:t>Contract</w:t></w:r></w:p>',
        ),
        args: { fileName: 'contract.pdf' },
        source: {
          package: 'word',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileName: 'template.docx',
        },
      },
    );

    expect(
      conversion.convertDocxToPdf,
    ).toHaveBeenCalledWith(
      expect.any(Buffer),
      'template.docx',
      'contract.pdf',
    );
    expect(result).toEqual({
      kind: 'new-document',
      buffer: pdf,
      package: 'pdf',
      mimeType: 'application/pdf',
      fileName: 'contract.pdf',
    });
  });

  it('replaces literal text split across runs in all supported text parts', async () => {
    const paragraph = `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Buna ${'${nu'}</w:t></w:r><w:r><w:t>me}</w:t></w:r></w:p>`;
    const extra = {
      'word/header1.xml': `<w:hdr xmlns:w="${NS}">${paragraph}</w:hdr>`,
      'word/footer1.xml': `<w:ftr xmlns:w="${NS}">${paragraph}</w:ftr>`,
      'word/footnotes.xml': `<w:footnotes xmlns:w="${NS}"><w:footnote w:id="1">${paragraph}</w:footnote></w:footnotes>`,
      'word/endnotes.xml': `<w:endnotes xmlns:w="${NS}"><w:endnote w:id="1">${paragraph}</w:endnote></w:endnotes>`,
    };
    const result = await adapter.execute(
      'replaceText',
      {
        document: makeDocx(
          `${paragraph}<w:p><w:r><w:t>Caseta ${'${nume}'}</w:t></w:r></w:p>`,
          extra,
        ),
        args: {
          search: '${nume}',
          replace: 'Ștefan',
        },
      },
    );

    expect(result.kind).toBe('mutation');
    if (result.kind !== 'mutation') return;
    expect(result.result).toEqual({
      replacement_count: 6,
    });
    for (const part of [
      'word/document.xml',
      ...Object.keys(extra),
    ]) {
      expect(
        partText(result.buffer, part),
      ).toContain('Ștefan');
      expect(
        partText(result.buffer, part),
      ).not.toContain('${nume}');
    }
    expect(partText(result.buffer)).toContain(
      '<w:b/>',
    );
  });

  it('creates indexed copies in every matching table and removes each template', async () => {
    const table = (suffix: string) => `<w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Antet ${suffix}</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:trPr><w:cantSplit/></w:trPr>
        <w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${'${row}'}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Produs ${'${row}'}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>`;
    const result = await adapter.execute(
      'createTableRows',
      {
        document: makeDocx(
          `${table('A')}${table('B')}`,
        ),
        args: {
          search: '${row}',
          nrOfNewRows: 2,
        },
      },
    );

    expect(result.kind).toBe('mutation');
    if (result.kind !== 'mutation') return;
    expect(result.result).toEqual({
      tables_affected: 2,
      rows_created: 4,
    });
    const xml = partText(result.buffer);
    expect(xml).not.toContain('${row}');
    expect(
      (xml.match(/Produs 1/g) ?? []).length,
    ).toBe(2);
    expect(
      (xml.match(/Produs 2/g) ?? []).length,
    ).toBe(2);
    expect(
      (xml.match(/w:tcW/g) ?? []).length,
    ).toBeGreaterThanOrEqual(4);

    if (process.env.WORD_FIXTURE_OUTPUT) {
      writeFileSync(
        process.env.WORD_FIXTURE_OUTPUT,
        result.buffer,
      );
    }
  });

  it('inserts blank styled rows and keeps the template as the final row', async () => {
    const document = makeDocx(`<w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Header</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:tcPr><w:shd w:fill="D9EAF7"/></w:tcPr><w:p><w:r><w:t>${'${row}'}</w:t><w:drawing/></w:r></w:p></w:tc></w:tr>
    </w:tbl>`);
    const result = await adapter.execute(
      'insertTableRows',
      {
        document,
        args: {
          search: '${row}',
          nrOfNewRows: 2,
        },
      },
    );

    expect(result.kind).toBe('mutation');
    if (result.kind !== 'mutation') return;
    expect(result.result).toEqual({
      tables_affected: 1,
      rows_created: 2,
    });
    const xml = partText(result.buffer);
    expect(
      (xml.match(/w:shd/g) ?? []).length,
    ).toBe(3);
    expect(
      (xml.match(/\$\{row\}/g) ?? []).length,
    ).toBe(1);
    expect(
      (xml.match(/w:drawing/g) ?? []).length,
    ).toBe(1);
  });

  it('rejects multiple templates, a non-final template and invalid row counts', async () => {
    const multiple = makeDocx(`<w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>${'${row}'}</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>${'${row}'}</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>`);
    await expect(
      adapter.execute('createTableRows', {
        document: multiple,
        args: {
          search: '${row}',
          nrOfNewRows: 1,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const nonFinal = makeDocx(`<w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>${'${row}'}</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Final</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>`);
    await expect(
      adapter.execute('insertTableRows', {
        document: nonFinal,
        args: {
          search: '${row}',
          nrOfNewRows: 1,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      adapter.execute('createTableRows', {
        document: nonFinal,
        args: {
          search: '${row}',
          nrOfNewRows: 0,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
