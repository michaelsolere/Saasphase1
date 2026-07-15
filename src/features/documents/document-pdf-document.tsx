import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
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
    fontSize: 18,
    lineHeight: 1.2,
    marginBottom: 20,
    textAlign: "center" as const,
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

export function DocumentPdfDocument({
  presentation,
}: {
  presentation: DocumentPdfPresentation;
}) {
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
            ...section.signatureLabels.map((label) =>
              createElement(
                View,
                { key: label, style: documentPdfStyles.signatureBlock },
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
      createElement(Text, { style: documentPdfStyles.title }, presentation.title),
      ...sectionElements,
    ),
  );
}
