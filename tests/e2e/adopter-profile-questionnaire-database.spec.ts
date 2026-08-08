import { expect, test } from "@playwright/test";

import { runE2eSqlSync } from "./helpers/supabase";

test.setTimeout(120_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";
const viewerId = "10000000-0000-4000-8000-000000000003";
const prefix = "9f350001-0000-4000-8000-0000000000";
const ids = {
  contact: `${prefix}01`, reservation: `${prefix}02`, payment: `${prefix}03`, access: `${prefix}04`, session: `${prefix}05`,
  save: `${prefix}06`, staleSave: `${prefix}07`, submit: `${prefix}08`, secondSubmit: `${prefix}09`, review: `${prefix}10`,
  waiverContact: `${prefix}11`, waiverReservation: `${prefix}12`, waiverPayment: `${prefix}13`, waiverCommunication: `${prefix}14`, waiverCommand: `${prefix}15`,
  historicalReservation: `${prefix}16`, historicalPayment: `${prefix}17`,
  foreignOrganization: `${prefix}18`, foreignContact: `${prefix}19`, foreignReservation: `${prefix}20`, foreignPayment: `${prefix}21`,
  incompleteContact: `${prefix}22`, incompleteReservation: `${prefix}23`, incompletePayment: `${prefix}24`,
  invitationAttempt: `${prefix}25`, reminderAttempt: `${prefix}26`,
  waiverAccess: `${prefix}27`, waiverSession: `${prefix}28`, revokeCommand: `${prefix}29`,
} as const;
const fixturePrefix = "E2E PROFILE-REVIEW-01";

function q(value: string) { return `'${value.replaceAll("'", "''")}'`; }
function sql(value: string) { return runE2eSqlSync(value); }
function scalar(value: string) { return sql(value).trim(); }

function cleanup() {
  sql(`
    begin;
    set local app.qa_hard_delete = 'on';
    drop trigger if exists e2e_profile_review_injected_failure on public.adopter_profile_questionnaire_instances;
    drop function if exists public.e2e_profile_review_injected_failure();
    delete from public.adopter_profile_questionnaire_commands where instance_id in (select id from public.adopter_profile_questionnaire_instances where reservation_id::text like '${prefix.slice(0, -2)}%');
    delete from public.adopter_profile_questionnaire_sessions where instance_id in (select id from public.adopter_profile_questionnaire_instances where reservation_id::text like '${prefix.slice(0, -2)}%');
    delete from public.adopter_profile_questionnaire_accesses where instance_id in (select id from public.adopter_profile_questionnaire_instances where reservation_id::text like '${prefix.slice(0, -2)}%');
    delete from public.adopter_profile_questionnaire_reconciliation_attempts where reservation_id::text like '${prefix.slice(0, -2)}%';
    delete from public.adopter_profile_questionnaire_events where reservation_id::text like '${prefix.slice(0, -2)}%';
    delete from public.adopter_profile_questionnaire_instances where reservation_id::text like '${prefix.slice(0, -2)}%';
    delete from public.email_delivery_attempts where id::text like '${prefix.slice(0, -2)}%' or idempotency_key like '${fixturePrefix}%';
    delete from public.adopter_manual_contacts where id::text like '${prefix.slice(0, -2)}%' or summary like '${fixturePrefix}%';
    delete from public.payments where id::text like '${prefix.slice(0, -2)}%' or notes like '${fixturePrefix}%';
    delete from public.reservations where id::text like '${prefix.slice(0, -2)}%' or internal_comment like '${fixturePrefix}%';
    delete from public.contacts where id::text like '${prefix.slice(0, -2)}%' or display_name like '${fixturePrefix}%';
    delete from public.organizations where id = ${q(ids.foreignOrganization)}::uuid;
    commit;
  `);
}

function setup() {
  sql(`
    insert into public.contacts (id, organization_id, display_name, email, created_by, updated_by)
    values
      (${q(ids.contact)}::uuid, ${q(organizationId)}::uuid, '${fixturePrefix} famille', 'profile-review-01@invalid.example', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.waiverContact)}::uuid, ${q(organizationId)}::uuid, '${fixturePrefix} dérogation', 'profile-review-01-waiver@invalid.example', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.incompleteContact)}::uuid, ${q(organizationId)}::uuid, '${fixturePrefix} préférence incomplète', 'profile-review-01-incomplete@invalid.example', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.reservations (id, organization_id, contact_id, species, breed, status, reserved_sex_preference, internal_comment, created_by, updated_by)
    values
      (${q(ids.reservation)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, 'dog', 'Golden Retriever', 'active', 'male_only', '${fixturePrefix} nominal', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.waiverReservation)}::uuid, ${q(organizationId)}::uuid, ${q(ids.waiverContact)}::uuid, 'dog', 'Golden Retriever', 'active', 'no_preference', '${fixturePrefix} waiver', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.historicalReservation)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, 'dog', 'Golden Retriever', 'active', 'male_only', '${fixturePrefix} historical', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.incompleteReservation)}::uuid, ${q(organizationId)}::uuid, ${q(ids.incompleteContact)}::uuid, 'dog', 'Golden Retriever', 'active', 'no_preference', '${fixturePrefix} incident injecté', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.payments (id, organization_id, contact_id, reservation_id, amount_cents, currency, payment_type, status, paid_at, notes, created_by, updated_by)
    values
      (${q(ids.payment)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, ${q(ids.reservation)}::uuid, 30000, 'EUR', 'arrhes', 'paid', now(), '${fixturePrefix} nominal', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.waiverPayment)}::uuid, ${q(organizationId)}::uuid, ${q(ids.waiverContact)}::uuid, ${q(ids.waiverReservation)}::uuid, 30000, 'EUR', 'arrhes', 'paid', now(), '${fixturePrefix} waiver', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.historicalPayment)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, ${q(ids.historicalReservation)}::uuid, 30000, 'EUR', 'arrhes', 'paid', now() - interval '30 days', '${fixturePrefix} historical', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);
  sql(`
    insert into public.organizations (id, name, slug) values (${q(ids.foreignOrganization)}::uuid, '${fixturePrefix} autre organisation', 'e2e-profile-review-01-foreign');
    insert into public.contacts (id, organization_id, display_name, email, created_by, updated_by) values (${q(ids.foreignContact)}::uuid, ${q(ids.foreignOrganization)}::uuid, '${fixturePrefix} autre famille', 'profile-review-01-foreign@invalid.example', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.reservations (id, organization_id, contact_id, species, breed, status, reserved_sex_preference, internal_comment, created_by, updated_by) values (${q(ids.foreignReservation)}::uuid, ${q(ids.foreignOrganization)}::uuid, ${q(ids.foreignContact)}::uuid, 'dog', 'Golden Retriever', 'active', 'no_preference', '${fixturePrefix} autre organisation', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    insert into public.payments (id, organization_id, contact_id, reservation_id, amount_cents, currency, payment_type, status, paid_at, notes, created_by, updated_by) values (${q(ids.foreignPayment)}::uuid, ${q(ids.foreignOrganization)}::uuid, ${q(ids.foreignContact)}::uuid, ${q(ids.foreignReservation)}::uuid, 30000, 'EUR', 'arrhes', 'paid', now(), '${fixturePrefix} autre organisation', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
  `);
  sql(`
    create function public.e2e_profile_review_injected_failure()
    returns trigger language plpgsql as $$
    begin
      if new.reservation_id = ${q(ids.incompleteReservation)}::uuid then
        raise exception 'e2e injected profile provisioning failure';
      end if;
      return new;
    end;
    $$;
    create trigger e2e_profile_review_injected_failure
      before insert on public.adopter_profile_questionnaire_instances
      for each row execute function public.e2e_profile_review_injected_failure();
  `);
  sql(`insert into public.payments (id, organization_id, contact_id, reservation_id, amount_cents, currency, payment_type, status, paid_at, notes, created_by, updated_by) values (${q(ids.incompletePayment)}::uuid, ${q(organizationId)}::uuid, ${q(ids.incompleteContact)}::uuid, ${q(ids.incompleteReservation)}::uuid, 30000, 'EUR', 'arrhes', 'paid', now(), '${fixturePrefix} incident injecté', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);`);
  sql(`drop trigger e2e_profile_review_injected_failure on public.adopter_profile_questionnaire_instances; drop function public.e2e_profile_review_injected_failure();`);
}

test("provisioning, public session, optimistic draft, unique final, review and historical recovery remain auditable", () => {
  cleanup();
  try {
    setup();
    expect(scalar(`select count(*) from public.adopter_profile_questionnaire_instances where reservation_id in (${q(ids.reservation)}::uuid, ${q(ids.waiverReservation)}::uuid, ${q(ids.historicalReservation)}::uuid);`)).toBe("3");
    expect(scalar(`select count(*) from public.adopter_profile_questionnaire_events where reservation_id = ${q(ids.reservation)}::uuid and event_type = 'profile_questionnaire_created';`)).toBe("1");
    expect(scalar(`select count(*) from public.payments where id = ${q(ids.incompletePayment)}::uuid;`)).toBe("1");
    expect(scalar(`select count(*) from public.adopter_profile_questionnaire_instances where reservation_id = ${q(ids.incompleteReservation)}::uuid;`)).toBe("0");
    expect(scalar(`select count(*) from public.adopter_profile_questionnaire_reconciliation_attempts where reservation_id = ${q(ids.incompleteReservation)}::uuid and outcome = 'failed';`)).toBe("1");

    const instanceId = scalar(`select id from public.adopter_profile_questionnaire_instances where reservation_id = ${q(ids.reservation)}::uuid;`);
    expect(scalar(`select public.record_adopter_profile_questionnaire_delivery_failure(${q(instanceId)}::uuid, 'invitation', 'e2e_failure', null);`)).toBe("recorded");
    expect(scalar(`select count(*) from public.adopter_profile_questionnaire_instances where id = ${q(instanceId)}::uuid and invitation_last_failed_at is not null;`)).toBe("1");
    sql(`
      insert into public.email_delivery_attempts (
        id, organization_id, contact_id, reservation_id, message_type,
        recipient_email, idempotency_key, status, sent_at, created_by, updated_by
      ) values
        (${q(ids.invitationAttempt)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, ${q(ids.reservation)}::uuid,
         'adopter_profile_invitation', 'profile-review-01@invalid.example', '${fixturePrefix}:invitation', 'sent', now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
        (${q(ids.reminderAttempt)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, ${q(ids.reservation)}::uuid,
         'adopter_profile_reminder', 'profile-review-01@invalid.example', '${fixturePrefix}:reminder', 'sent', now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);
    `);
    expect(scalar(`select public.finalize_adopter_profile_questionnaire_delivery(${q(instanceId)}::uuid, ${q(ids.invitationAttempt)}::uuid, 'invitation');`)).toBe("finalized");
    expect(scalar(`select public.finalize_adopter_profile_questionnaire_delivery(${q(instanceId)}::uuid, ${q(ids.invitationAttempt)}::uuid, 'invitation');`)).toBe("finalized");
    expect(scalar(`select public.finalize_adopter_profile_questionnaire_delivery(${q(instanceId)}::uuid, ${q(ids.reminderAttempt)}::uuid, 'reminder');`)).toBe("finalized");
    expect(scalar(`select count(*) from public.adopter_profile_questionnaire_events where instance_id = ${q(instanceId)}::uuid and event_type in ('profile_questionnaire_sent', 'profile_questionnaire_reminder_sent');`)).toBe("2");
    expect(scalar(`select count(*) from public.adopter_profile_questionnaire_instances where id = ${q(instanceId)}::uuid and invitation_delivery_attempt_id = ${q(ids.invitationAttempt)}::uuid and reminder_delivery_attempt_id = ${q(ids.reminderAttempt)}::uuid;`)).toBe("1");
    sql(`update public.adopter_profile_questionnaire_instances set reminder_delivery_attempt_id = null where id = ${q(instanceId)}::uuid; update public.email_delivery_attempts set sent_at = now() - interval '8 days' where id = ${q(ids.invitationAttempt)}::uuid;`);
    expect(scalar(`select delivery_kind from public.list_due_adopter_profile_questionnaire_deliveries(20) where instance_id = ${q(instanceId)}::uuid;`)).toBe("reminder");
    sql(`
      insert into public.adopter_profile_questionnaire_accesses (id, organization_id, instance_id, token_hash)
      values (${q(ids.access)}::uuid, ${q(organizationId)}::uuid, ${q(instanceId)}::uuid, repeat('a', 64));
      select * from public.exchange_adopter_profile_questionnaire_token(repeat('a', 64), repeat('b', 64));
    `);
    expect(scalar(`select count(*) from public.adopter_profile_questionnaire_sessions where session_hash = repeat('b', 64);`)).toBe("1");
    expect(scalar(`begin; set local role service_role; select count(*) from public.adopter_profile_questionnaire_sessions where session_hash = repeat('b', 64); rollback;`).split("\n").filter(Boolean)).toContain("1");
    expect(scalar(`begin; set local role service_role; select instance_id from public.read_adopter_profile_questionnaire_public_context(repeat('b', 64)); rollback;`).split("\n").filter(Boolean)).toContain(instanceId);
    expect(scalar(`begin; set local role service_role; select contact_display_name from public.read_adopter_profile_questionnaire_delivery_context(${q(instanceId)}::uuid, 'invitation'); rollback;`).split("\n").filter(Boolean)).toContain(`${fixturePrefix} famille`);

    const save = sql(`select outcome || ':' || revision from public.save_adopter_profile_questionnaire_draft(repeat('b', 64), 0, '{"household_adults":2}'::jsonb, ${q(ids.save)}::uuid);`);
    expect(save.trim()).toBe("saved:1");
    expect(scalar(`select outcome from public.save_adopter_profile_questionnaire_draft(repeat('b', 64), 0, '{"household_adults":3}'::jsonb, ${q(ids.staleSave)}::uuid);`)).toBe("conflict");

    const answers = JSON.stringify({ sex_preference_confirmation: "changed", sex_preference_proposal: "female_only", household_adults: 2 });
    expect(scalar(`select outcome from public.submit_adopter_profile_questionnaire(repeat('b', 64), 1, ${q(answers)}::jsonb, ${q(ids.submit)}::uuid);`)).toBe("submitted");
    expect(scalar(`select outcome from public.submit_adopter_profile_questionnaire(repeat('b', 64), 1, ${q(answers)}::jsonb, ${q(ids.submit)}::uuid);`)).toBe("submitted");
    expect(scalar(`select outcome from public.submit_adopter_profile_questionnaire(repeat('b', 64), 1, ${q(answers)}::jsonb, ${q(ids.secondSubmit)}::uuid);`)).toBe("already_submitted");
    expect(scalar(`select count(*) from public.adopter_profile_questionnaire_events where instance_id = ${q(instanceId)}::uuid and event_type = 'profile_questionnaire_received';`)).toBe("1");

    const reviewOutcome = scalar(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(ownerId)}, true); select outcome from public.review_adopter_profile_questionnaire(${q(instanceId)}::uuid, 'update', ${q(ids.review)}::uuid); commit;`);
    expect(reviewOutcome.split("\n").filter(Boolean)).toContain("reviewed");
    expect(scalar(`select reserved_sex_preference from public.reservations where id = ${q(ids.reservation)}::uuid;`)).toBe("female_only");
    expect(scalar(`select count(*) from public.adopter_profile_questionnaire_instances where id = ${q(instanceId)}::uuid and reviewed_at is not null and sex_preference_decision = 'update';`)).toBe("1");

    const historicalInstance = scalar(`select id from public.adopter_profile_questionnaire_instances where reservation_id = ${q(ids.historicalReservation)}::uuid;`);
    sql(`begin; set local app.qa_hard_delete = 'on'; delete from public.adopter_profile_questionnaire_events where instance_id = ${q(historicalInstance)}::uuid; delete from public.adopter_profile_questionnaire_instances where id = ${q(historicalInstance)}::uuid; commit;`);
    expect(scalar(`select count(*) from public.reconcile_adopter_profile_questionnaire_instances() where reservation_id = ${q(ids.historicalReservation)}::uuid and outcome = 'created';`)).toBe("1");
    expect(scalar(`select count(*) from public.adopter_profile_questionnaire_instances where reservation_id = ${q(ids.historicalReservation)}::uuid and automatic_invitation_allowed = false and invitation_delivery_attempt_id is null;`)).toBe("1");

    const waiverInstance = scalar(`select id from public.adopter_profile_questionnaire_instances where reservation_id = ${q(ids.waiverReservation)}::uuid;`);
    sql(`
      insert into public.adopter_profile_questionnaire_accesses (id, organization_id, instance_id, token_hash)
      values (${q(ids.waiverAccess)}::uuid, ${q(organizationId)}::uuid, ${q(waiverInstance)}::uuid, repeat('c', 64));
      insert into public.adopter_profile_questionnaire_sessions (id, organization_id, instance_id, access_id, session_hash, expires_at)
      values (${q(ids.waiverSession)}::uuid, ${q(organizationId)}::uuid, ${q(waiverInstance)}::uuid, ${q(ids.waiverAccess)}::uuid, repeat('d', 64), now() + interval '1 day');
    `);
    const revokeOutcome = scalar(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(ownerId)}, true); select outcome from public.revoke_adopter_profile_questionnaire_access(${q(waiverInstance)}::uuid, 'manual', ${q(ids.revokeCommand)}::uuid); commit;`);
    expect(revokeOutcome.split("\n").filter(Boolean)).toContain("revoked");
    expect(scalar(`select count(*) from public.adopter_profile_questionnaire_accesses where id = ${q(ids.waiverAccess)}::uuid and revoked_at is not null;`)).toBe("1");
    expect(scalar(`select count(*) from public.adopter_profile_questionnaire_sessions where id = ${q(ids.waiverSession)}::uuid and revoked_at is not null;`)).toBe("1");
    sql(`insert into public.adopter_manual_contacts (id, organization_id, reservation_id, contact_id, channel, summary, contacted_at, actor_profile_id, actor_role, client_command_id) values (${q(ids.waiverCommunication)}::uuid, ${q(organizationId)}::uuid, ${q(ids.waiverReservation)}::uuid, ${q(ids.waiverContact)}::uuid, 'phone', '${fixturePrefix} appel', now(), ${q(ownerId)}::uuid, 'owner', ${q(ids.waiverCommunication)}::uuid);`);
    const waiverOutcome = scalar(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(ownerId)}, true); select outcome from public.waive_adopter_profile_questionnaire(${q(waiverInstance)}::uuid, 'Précision obtenue par téléphone', ${q(ids.waiverCommunication)}::uuid, ${q(ids.waiverCommand)}::uuid); commit;`);
    expect(waiverOutcome.split("\n").filter(Boolean)).toContain("waived");
    expect(scalar(`select count(*) from public.adopter_profile_questionnaire_instances where id = ${q(waiverInstance)}::uuid and waived_at is not null and final_answers is null;`)).toBe("1");

    expect(() => scalar(`begin; set local role anon; select count(*) from public.adopter_profile_questionnaire_instances; commit;`)).toThrow(/permission denied/);
    expect(scalar(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(memberId)}, true); select count(*) from public.adopter_profile_questionnaire_instances where reservation_id = ${q(ids.reservation)}::uuid; commit;`).split("\n").filter(Boolean)).toContain("1");
    expect(scalar(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(viewerId)}, true); select count(*) from public.adopter_profile_questionnaire_instances where reservation_id = ${q(ids.reservation)}::uuid; commit;`).split("\n").filter(Boolean)).toContain("1");
    expect(scalar(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(memberId)}, true); select outcome from public.review_adopter_profile_questionnaire(${q(instanceId)}::uuid, null, gen_random_uuid()); commit;`).split("\n").filter(Boolean)).toContain("forbidden");
    expect(scalar(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', ${q(ownerId)}, true); select count(*) from public.adopter_profile_questionnaire_instances where organization_id = ${q(ids.foreignOrganization)}::uuid; commit;`).split("\n").filter(Boolean)).toContain("0");
    expect(scalar(`select count(*) from unnest(array['UPDATE', 'DELETE', 'TRUNCATE']) privilege_name where has_table_privilege('service_role', 'public.adopter_profile_questionnaire_events', privilege_name);`)).toBe("0");
    expect(() => scalar(`begin; set local role service_role; set local app.qa_hard_delete = 'on'; delete from public.adopter_profile_questionnaire_events where instance_id = ${q(instanceId)}::uuid; rollback;`)).toThrow(/permission denied|append-only/i);
  } finally {
    cleanup();
  }
  const residual = scalar(`select (
    (select count(*) from public.adopter_profile_questionnaire_instances where reservation_id::text like '${prefix.slice(0, -2)}%') +
    (select count(*) from public.adopter_profile_questionnaire_events where reservation_id::text like '${prefix.slice(0, -2)}%') +
    (select count(*) from public.adopter_profile_questionnaire_reconciliation_attempts where reservation_id::text like '${prefix.slice(0, -2)}%') +
    (select count(*) from public.email_delivery_attempts where id::text like '${prefix.slice(0, -2)}%' or idempotency_key like '${fixturePrefix}%') +
    (select count(*) from public.payments where id::text like '${prefix.slice(0, -2)}%' or notes like '${fixturePrefix}%') +
    (select count(*) from public.reservations where id::text like '${prefix.slice(0, -2)}%' or internal_comment like '${fixturePrefix}%') +
    (select count(*) from public.contacts where id::text like '${prefix.slice(0, -2)}%' or display_name like '${fixturePrefix}%') +
    (select count(*) from public.organizations where id = ${q(ids.foreignOrganization)}::uuid)
  );`);
  expect(residual).toBe("0");
});
