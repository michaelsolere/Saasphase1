import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { createElement } from "react";

import type { DocumentPdfPresentation } from "./document-pdf-presentation";

export const documentPdfStyles = StyleSheet.create({
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
    fontSize: 24,
    lineHeight: 1.2,
    marginBottom: 22,
    textAlign: "center" as const,
  },
  logo: {
    alignSelf: "center" as const,
    marginBottom: 14,
    objectFit: "contain" as const,
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
  freeBody: {
    marginBottom: 14,
  },
  freeBodyBold: {
    fontFamily: "Helvetica-Bold",
  },
  sectionEnd: {
    marginBottom: 14,
  },
  signatureSection: {
    marginTop: 8,
    marginBottom: 14,
  },
  signatures: {
    flexDirection: "row" as const,
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
    position: "absolute" as const,
    bottom: 22,
    left: 46,
    right: 46,
    fontSize: 8,
    textAlign: "center" as const,
    color: "#555555",
  },
});

export function getDocumentPdfLogoSize(logo: {
  widthPx: number;
  heightPx: number;
}) {
  const scale = Math.min(120 / logo.widthPx, 60 / logo.heightPx, 1);
  return { width: logo.widthPx * scale, height: logo.heightPx * scale };
}

export function DocumentPdfDocument({
  presentation,
  logo = null,
}: {
  presentation: DocumentPdfPresentation;
  logo?: { dataUri: string; widthPx: number; heightPx: number } | null;
}) {
  const logoSize = logo ? getDocumentPdfLogoSize(logo) : null;
  const sectionElements = presentation.sections.flatMap((section) => {
    if (section.signatureLabels) {
      return [
        createElement(
          View,
          {
            key: section.id,
            style: documentPdfStyles.signatureSection,
            wrap: false,
          },
          createElement(
            Text,
            { style: documentPdfStyles.sectionTitle },
            section.title,
          ),
          createElement(
            View,
            { style: documentPdfStyles.signatures, wrap: false },
            ...section.signatureLabels.map((label, index) =>
              createElement(
                View,
                { key: `${section.id}-${index}`, style: documentPdfStyles.signatureBlock },
                createElement(
                  Text,
                  { style: documentPdfStyles.signatureLabel },
                  label,
                ),
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
          style: documentPdfStyles.sectionHeading,
          wrap: false,
          minPresenceAhead: 30,
        },
        createElement(
          Text,
          { style: documentPdfStyles.sectionTitle },
          section.title,
        ),
      ),
      ...section.paragraphs.map((paragraph, index) =>
        createElement(
          Text,
          {
            key: `${section.id}-${index}`,
            style:
              index === section.paragraphs.length - 1
                ? [documentPdfStyles.paragraph, documentPdfStyles.sectionEnd]
                : documentPdfStyles.paragraph,
          },
          paragraph,
        ),
      ),
    ];
  });

  return createElement(
    Document,
    { title: presentation.title, author: "SaaS Élevage" },
    createElement(
      Page,
      {
        size: "A4",
        orientation: "portrait",
        style: documentPdfStyles.page,
        wrap: true,
      },
      createElement(Text, {
        fixed: true,
        style: documentPdfStyles.footer,
        render: ({ pageNumber, totalPages }) =>
          `Page ${pageNumber} / ${totalPages}`,
      }),
      logo && logoSize
        ? createElement(Image, {
            src: logo.dataUri,
            style: [documentPdfStyles.logo, logoSize],
          })
        : null,
      createElement(Text, { style: documentPdfStyles.title }, presentation.title),
      presentation.freeTextParagraphs !== undefined
        ? createElement(
            Text,
            { style: documentPdfStyles.freeBody },
            ...presentation.freeTextParagraphs.flatMap((paragraph, paragraphIndex) => [
              ...paragraph.runs.map((run, runIndex) => createElement(
                Text,
                {
                  key: `free-${paragraphIndex}-${runIndex}`,
                  style: run.bold ? documentPdfStyles.freeBodyBold : undefined,
                },
                run.text,
              )),
              paragraphIndex < presentation.freeTextParagraphs!.length - 1 ? "\n" : "",
            ]),
          )
        : presentation.freeBody !== undefined
          ? createElement(Text, { style: documentPdfStyles.freeBody }, presentation.freeBody)
        : null,
      ...sectionElements,
    ),
  );
}
