import { createHash } from "node:crypto";

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { createElement } from "react";

import {
  buildDocumentPdfPresentation,
  type DocumentPdfPresentation,
} from "./document-pdf-presentation";
import { parseDocumentGenerationSnapshot } from "./parse-document-generation-snapshot";
import { parseDocumentTemplateDefinition } from "./parse-document-template-definition";

export type RenderDocumentPdfInput = {
  documentType: string;
  snapshot: unknown;
  templateContent: string;
};

export type RenderDocumentPdfErrorCode =
  | "invalid_snapshot"
  | "invalid_template"
  | "document_type_mismatch"
  | "template_hash_mismatch"
  | "render_error";

export type RenderDocumentPdfResult =
  | {
      outcome: "success";
      bytes: Buffer;
      mimeType: "application/pdf";
      fileName: string;
      documentType: "reservation_contract" | "commitment_certificate";
    }
  | {
      outcome: "error";
      error: { code: RenderDocumentPdfErrorCode };
    };

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingRight: 46,
    paddingBottom: 52,
    paddingLeft: 46,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.45,
    color: "#111111",
  },
  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    lineHeight: 1.2,
    marginBottom: 20,
    textAlign: "center",
  },
  sectionHeading: {
    marginTop: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    marginBottom: 6,
    borderBottomWidth: 0.6,
    borderBottomColor: "#555555",
    paddingBottom: 3,
  },
  paragraph: {
    marginBottom: 5,
  },
  sectionEnd: {
    marginBottom: 14,
  },
  signatureSection: {
    marginTop: 8,
    marginBottom: 14,
  },
  signatures: {
    flexDirection: "row",
    gap: 24,
    marginTop: 6,
  },
  signatureBlock: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: 90,
    borderWidth: 0.7,
    borderColor: "#555555",
    padding: 8,
  },
  signatureLabel: {
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 46,
    right: 46,
    fontSize: 8,
    textAlign: "center",
    color: "#555555",
  },
});

function PdfDocument({ presentation }: { presentation: DocumentPdfPresentation }) {
  const sectionElements = presentation.sections.flatMap((section) => {
    const paragraphElements = section.paragraphs.map((paragraph, index) =>
      createElement(
        Text,
        {
          key: `${section.id}-${index}`,
          style:
            index === section.paragraphs.length - 1
              ? [styles.paragraph, styles.sectionEnd]
              : styles.paragraph,
        },
        paragraph,
      ),
    );
    if (section.signatureLabels) {
      return [
        createElement(
          View,
          {
            key: section.id,
            style: styles.signatureSection,
            wrap: false,
          },
          createElement(Text, { style: styles.sectionTitle }, section.title),
          createElement(
            View,
            { style: styles.signatures, wrap: false },
            ...section.signatureLabels.map((label) =>
              createElement(
                View,
                { key: label, style: styles.signatureBlock },
                createElement(Text, { style: styles.signatureLabel }, label),
              ),
            ),
          ),
        ),
      ];
    }

    return [
      createElement(
        View,
        {
          key: `${section.id}-heading`,
          style: styles.sectionHeading,
          wrap: false,
          minPresenceAhead: 30,
        },
        createElement(Text, { style: styles.sectionTitle }, section.title),
      ),
      ...paragraphElements,
    ];
  });

  return createElement(
    Document,
    { title: presentation.title, author: "SaaS Élevage" },
    createElement(
      Page,
      { size: "A4", orientation: "portrait", style: styles.page, wrap: true },
      createElement(Text, {
        fixed: true,
        style: styles.footer,
        render: ({ pageNumber, totalPages }) =>
          `Page ${pageNumber} / ${totalPages}`,
      }),
      createElement(Text, { style: styles.title }, presentation.title),
      ...sectionElements,
    ),
  );
}

function fail(code: RenderDocumentPdfErrorCode): RenderDocumentPdfResult {
  return { outcome: "error", error: { code } };
}

export async function renderDocumentPdfCore(
  input: RenderDocumentPdfInput,
): Promise<RenderDocumentPdfResult> {
  const parsedSnapshot = parseDocumentGenerationSnapshot({
    documentType: input.documentType,
    generationData: input.snapshot,
  });
  if (!parsedSnapshot.success) {
    return fail(
      parsedSnapshot.error === "document_type_mismatch"
        ? "document_type_mismatch"
        : "invalid_snapshot",
    );
  }

  const parsedTemplate = parseDocumentTemplateDefinition({
    templateFormat: "json",
    documentType: input.documentType,
    templateContent: input.templateContent,
  });
  if (!parsedTemplate.success) {
    return fail(
      parsedTemplate.error === "document_type_mismatch"
        ? "document_type_mismatch"
        : "invalid_template",
    );
  }
  if (
    parsedSnapshot.snapshot.documentType !== parsedTemplate.definition.documentType
  ) {
    return fail("document_type_mismatch");
  }

  const contentHash = createHash("sha256")
    .update(input.templateContent)
    .digest("hex");
  if (contentHash !== parsedSnapshot.snapshot.template.templateContentSha256) {
    return fail("template_hash_mismatch");
  }

  const presentation = buildDocumentPdfPresentation(
    parsedSnapshot.snapshot,
    parsedTemplate.definition,
  );
  if (!presentation) return fail("document_type_mismatch");

  try {
    const bytes = await renderToBuffer(PdfDocument({ presentation }));
    return {
      outcome: "success",
      bytes: Buffer.from(bytes),
      mimeType: "application/pdf",
      fileName: presentation.fileName,
      documentType: presentation.documentType,
    };
  } catch {
    return fail("render_error");
  }
}
