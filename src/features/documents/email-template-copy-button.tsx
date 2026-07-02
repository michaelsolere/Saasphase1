"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function EmailTemplateCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copyText() {
    let copySucceeded = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copySucceeded = true;
      }
    } catch {
      copySucceeded = false;
    }

    if (!copySucceeded) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
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
