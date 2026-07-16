export type BrevoEmailIdentity = {
  email: string;
  name?: string;
};

export type SendBrevoTransactionalEmailInput = {
  templateId: number;
  to: BrevoEmailIdentity;
  params: Record<string, string>;
  idempotencyKey: string;
  tags?: string[];
  attachments?: Array<{ name: string; content: string }>;
};

export function buildBrevoTransactionalEmailPayload(
  input: SendBrevoTransactionalEmailInput,
  configuration: {
    senderEmail: string | null;
    senderName: string | null;
    replyToEmail: string | null;
  },
) {
  const payload: Record<string, unknown> = {
    templateId: input.templateId,
    to: [
      {
        email: input.to.email,
        ...(input.to.name ? { name: input.to.name } : {}),
      },
    ],
    params: input.params,
    headers: {
      "Idempotency-Key": input.idempotencyKey,
    },
    tags: input.tags,
  };

  // Attachments with templateId require a Brevo template using the new template syntax.
  if (input.attachments?.length) {
    payload.attachment = input.attachments;
  }

  if (configuration.senderEmail) {
    payload.sender = {
      email: configuration.senderEmail,
      ...(configuration.senderName ? { name: configuration.senderName } : {}),
    };
  }

  if (configuration.replyToEmail) {
    payload.replyTo = { email: configuration.replyToEmail };
  }

  return payload;
}
