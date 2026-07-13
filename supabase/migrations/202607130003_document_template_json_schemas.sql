alter table public.document_templates
  drop constraint document_templates_format_check;

alter table public.document_templates
  add constraint document_templates_format_check
    check (template_format in ('html', 'markdown', 'docx', 'pdf_form', 'other', 'json'));

alter table public.document_templates
  add constraint document_templates_json_content_check
    check (
      case
        when template_format = 'json' then
          template_content is not null
          and jsonb_typeof(template_content::jsonb) = 'object'
        else true
      end
    );
