"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

function getFieldValue(id?: string) {
  if (!id) {
    return null;
  }

  const field = document.getElementById(id);

  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement
  ) {
    return field.value;
  }

  return null;
}

export function EmailTemplateCopyButton({
  bodyFieldId,
  subjectFieldId,
  text,
}: {
  bodyFieldId?: string;
  subjectFieldId?: string;
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyText() {
    let copySucceeded = false;
    const subject = getFieldValue(subjectFieldId);
    const body = getFieldValue(bodyFieldId);
    const textToCopy =
      subject !== null && body !== null ? `Objet : ${subject}\n\n${body}` : text;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
        copySucceeded = true;
      }
    } catch {
      copySucceeded = false;
    }

    if (!copySucceeded) {
      const textarea = document.createElement("textarea");
      textarea.value = textToCopy;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.select();
      copySucceeded = document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    if (copySucceeded) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={copyText}
      aria-label={copied ? "Modèle copié" : "Copier le modèle"}
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
      {copied ? "Copié" : "Copier"}
    </Button>
  );
}
