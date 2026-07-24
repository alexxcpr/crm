import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import {
  DOMParser,
  XMLSerializer,
} from '@xmldom/xmldom';
import PizZip from 'pizzip';
import type {
  DocumentAdapterInput,
  DocumentAdapterResult,
  DocumentPackageAdapter,
} from './document.types';
import { OfficeConversionService } from './office-conversion.service';
import { PDF_MIME } from './pdf-document.adapter';

const WORD_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const WORD_PART_PATTERN =
  /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;
const REMOVED_FROM_BLANK_ROW = new Set([
  'w:drawing',
  'w:object',
  'w:pict',
  'w:hyperlink',
  'w:sdt',
]);

@Injectable()
export class WordDocumentAdapter implements DocumentPackageAdapter {
  readonly package = 'word' as const;
  readonly mimeTypes = [WORD_MIME] as const;

  constructor(
    private readonly conversion: OfficeConversionService,
  ) {}

  validate(buffer: Buffer): void {
    const zip = this.openZip(buffer);
    if (
      !zip.file('[Content_Types].xml') ||
      !zip.file('word/document.xml')
    ) {
      throw new BadRequestException(
        'Fisierul nu este un document DOCX valid.',
      );
    }
  }

  async execute(
    operation: string,
    input: DocumentAdapterInput,
  ): Promise<DocumentAdapterResult> {
    if (!input.document) {
      throw new BadRequestException(
        'Documentul Word este obligatoriu.',
      );
    }
    const { args } = input;
    const buffer = input.document;
    if (operation === 'convertToPdf') {
      const converted =
        await this.conversion.convertDocxToPdf(
          buffer,
          input.source?.fileName ??
            'document.docx',
          typeof args.fileName === 'string'
            ? args.fileName
            : undefined,
        );
      return {
        kind: 'new-document',
        buffer: converted.buffer,
        package: 'pdf',
        mimeType: PDF_MIME,
        fileName: converted.fileName,
      };
    }
    const zip = this.openZip(buffer);
    switch (operation) {
      case 'replaceText':
        return this.replaceText(
          zip,
          this.requiredString(
            args.search,
            'search',
          ),
          String(args.replace ?? ''),
        );
      case 'createTableRows':
        return this.createTableRows(
          zip,
          this.requiredString(
            args.search,
            'search',
          ),
          this.requiredRowCount(args.nrOfNewRows),
        );
      case 'insertTableRows':
        return this.insertTableRows(
          zip,
          this.requiredString(
            args.search,
            'search',
          ),
          this.requiredRowCount(args.nrOfNewRows),
        );
      default:
        throw new BadRequestException(
          `Operatia Word "${operation}" nu este suportata.`,
        );
    }
  }

  private replaceText(
    zip: PizZip,
    search: string,
    replacement: string,
  ): DocumentAdapterResult {
    let replacementCount = 0;
    for (const partName of this.wordPartNames(
      zip,
    )) {
      const document = this.parsePart(
        zip,
        partName,
      );
      replacementCount += this.replaceInElement(
        document,
        search,
        replacement,
      );
      this.writePart(zip, partName, document);
    }
    return {
      kind: 'mutation',
      buffer: this.generate(zip),
      result: {
        replacement_count: replacementCount,
      },
    };
  }

  private createTableRows(
    zip: PizZip,
    search: string,
    count: number,
  ): DocumentAdapterResult {
    let tablesAffected = 0;
    let rowsCreated = 0;
    for (const partName of this.wordPartNames(
      zip,
    )) {
      const document = this.parsePart(
        zip,
        partName,
      );
      const tables = this.elements(
        document,
        'w:tbl',
      );
      let partChanged = false;
      for (const table of tables) {
        const template = this.findTemplateRow(
          table,
          search,
        );
        if (!template) continue;
        for (
          let index = 1;
          index <= count;
          index += 1
        ) {
          const copy = template.cloneNode(
            true,
          ) as any;
          this.replaceInElement(
            copy,
            search,
            String(index),
          );
          table.insertBefore(copy, template);
        }
        table.removeChild(template);
        tablesAffected += 1;
        rowsCreated += count;
        partChanged = true;
      }
      if (partChanged)
        this.writePart(zip, partName, document);
    }
    return {
      kind: 'mutation',
      buffer: this.generate(zip),
      result: {
        tables_affected: tablesAffected,
        rows_created: rowsCreated,
      },
    };
  }

  private insertTableRows(
    zip: PizZip,
    search: string,
    count: number,
  ): DocumentAdapterResult {
    let tablesAffected = 0;
    let rowsCreated = 0;
    for (const partName of this.wordPartNames(
      zip,
    )) {
      const document = this.parsePart(
        zip,
        partName,
      );
      const tables = this.elements(
        document,
        'w:tbl',
      );
      let partChanged = false;
      for (const table of tables) {
        const template = this.findTemplateRow(
          table,
          search,
        );
        if (!template) continue;
        for (
          let index = 0;
          index < count;
          index += 1
        ) {
          const copy = template.cloneNode(
            true,
          ) as any;
          this.clearTemplateRow(copy);
          table.insertBefore(copy, template);
        }
        tablesAffected += 1;
        rowsCreated += count;
        partChanged = true;
      }
      if (partChanged)
        this.writePart(zip, partName, document);
    }
    return {
      kind: 'mutation',
      buffer: this.generate(zip),
      result: {
        tables_affected: tablesAffected,
        rows_created: rowsCreated,
      },
    };
  }

  private findTemplateRow(
    table: any,
    search: string,
  ): any | null {
    const rows = this.directChildren(
      table,
      'w:tr',
    );
    const matches = rows.filter((row) => {
      const firstCell = this.directChildren(
        row,
        'w:tc',
      )[0];
      return firstCell
        ? this.visibleText(firstCell).includes(
            search,
          )
        : false;
    });
    if (matches.length > 1) {
      throw new BadRequestException(
        `Un tabel poate contine un singur rand sablon pentru "${search}".`,
      );
    }
    if (!matches.length) return null;
    if (matches[0] !== rows[rows.length - 1]) {
      throw new BadRequestException(
        `Randul sablon pentru "${search}" trebuie sa fie ultimul rand din tabel.`,
      );
    }
    return matches[0];
  }

  private replaceInElement(
    root: any,
    search: string,
    replacement: string,
  ): number {
    let count = 0;
    for (const paragraph of this.elements(
      root,
      'w:p',
    )) {
      const textNodes = this.elements(
        paragraph,
        'w:t',
      );
      if (!textNodes.length) continue;
      const fullText = textNodes
        .map((node) => node.textContent ?? '')
        .join('');
      const positions: number[] = [];
      let cursor = 0;
      while (
        cursor <=
        fullText.length - search.length
      ) {
        const position = fullText.indexOf(
          search,
          cursor,
        );
        if (position < 0) break;
        positions.push(position);
        cursor = position + search.length;
      }
      for (
        let index = positions.length - 1;
        index >= 0;
        index -= 1
      ) {
        this.replaceRange(
          textNodes,
          positions[index],
          search.length,
          replacement,
        );
      }
      count += positions.length;
    }
    return count;
  }

  private replaceRange(
    nodes: any[],
    start: number,
    length: number,
    replacement: string,
  ): void {
    const end = start + length - 1;
    let offset = 0;
    let startNode = -1;
    let startLocal = -1;
    let endNode = -1;
    let endLocal = -1;

    nodes.forEach((node, index) => {
      const value = node.textContent ?? '';
      if (
        startNode < 0 &&
        start >= offset &&
        start < offset + value.length
      ) {
        startNode = index;
        startLocal = start - offset;
      }
      if (
        endNode < 0 &&
        end >= offset &&
        end < offset + value.length
      ) {
        endNode = index;
        endLocal = end - offset;
      }
      offset += value.length;
    });
    if (startNode < 0 || endNode < 0) return;

    const firstValue =
      nodes[startNode].textContent ?? '';
    if (startNode === endNode) {
      nodes[startNode].textContent =
        firstValue.slice(0, startLocal) +
        replacement +
        firstValue.slice(endLocal + 1);
      this.preserveWhitespace(nodes[startNode]);
      return;
    }

    const lastValue =
      nodes[endNode].textContent ?? '';
    nodes[startNode].textContent =
      firstValue.slice(0, startLocal) +
      replacement;
    this.preserveWhitespace(nodes[startNode]);
    for (
      let index = startNode + 1;
      index < endNode;
      index += 1
    ) {
      nodes[index].textContent = '';
    }
    nodes[endNode].textContent = lastValue.slice(
      endLocal + 1,
    );
    this.preserveWhitespace(nodes[endNode]);
  }

  private clearTemplateRow(row: any): void {
    this.removeDescendants(
      row,
      REMOVED_FROM_BLANK_ROW,
    );
    for (const nodeName of [
      'w:t',
      'w:instrText',
      'w:delText',
    ]) {
      for (const node of this.elements(
        row,
        nodeName,
      ))
        node.textContent = '';
    }
  }

  private removeDescendants(
    root: any,
    names: Set<string>,
  ): void {
    const children = Array.from(
      root.childNodes ?? [],
    ) as any[];
    for (const child of children) {
      if (names.has(child.nodeName)) {
        root.removeChild(child);
      } else {
        this.removeDescendants(child, names);
      }
    }
  }

  private visibleText(root: any): string {
    return this.elements(root, 'w:t')
      .map((node) => node.textContent ?? '')
      .join('');
  }

  private directChildren(
    root: any,
    name: string,
  ): any[] {
    return (
      Array.from(root.childNodes ?? []) as any[]
    ).filter(
      (node) =>
        node.nodeType === 1 &&
        node.nodeName === name,
    );
  }

  private elements(
    root: any,
    name: string,
  ): any[] {
    const collection =
      root.getElementsByTagName?.(name);
    const result: any[] = [];
    if (!collection) return result;
    for (
      let index = 0;
      index < collection.length;
      index += 1
    ) {
      result.push(collection.item(index));
    }
    return result;
  }

  private preserveWhitespace(
    textNode: any,
  ): void {
    if (
      /^\s|\s$/.test(textNode.textContent ?? '')
    ) {
      textNode.setAttribute(
        'xml:space',
        'preserve',
      );
    }
  }

  private wordPartNames(zip: PizZip): string[] {
    return Object.keys(zip.files).filter((name) =>
      WORD_PART_PATTERN.test(name),
    );
  }

  private parsePart(
    zip: PizZip,
    name: string,
  ): any {
    const xml = zip.file(name)?.asText();
    if (!xml)
      throw new BadRequestException(
        `Partea DOCX "${name}" lipseste.`,
      );
    return new DOMParser({
      onError: (level) => {
        if (level === 'fatalError') {
          throw new BadRequestException(
            `XML invalid in "${name}".`,
          );
        }
      },
    }).parseFromString(xml, 'application/xml');
  }

  private writePart(
    zip: PizZip,
    name: string,
    document: any,
  ): void {
    zip.file(
      name,
      new XMLSerializer().serializeToString(
        document,
      ),
    );
  }

  private openZip(buffer: Buffer): PizZip {
    try {
      return new PizZip(buffer);
    } catch {
      throw new BadRequestException(
        'Fisierul DOCX este corupt sau invalid.',
      );
    }
  }

  private generate(zip: PizZip): Buffer {
    return zip.generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
  }

  private requiredString(
    value: unknown,
    field: string,
  ): string {
    if (
      typeof value !== 'string' ||
      !value.length
    ) {
      throw new BadRequestException(
        `Argumentul "${field}" este obligatoriu.`,
      );
    }
    return value;
  }

  private requiredRowCount(
    value: unknown,
  ): number {
    const count = Number(value);
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 1_000
    ) {
      throw new BadRequestException(
        'nrOfNewRows trebuie sa fie un intreg intre 1 si 1000.',
      );
    }
    return count;
  }
}
