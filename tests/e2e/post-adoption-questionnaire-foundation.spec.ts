import { expect, test } from "@playwright/test";

import { runE2eSqlSync } from "./helpers/supabase";

test.setTimeout(240_000);

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const contactId = "70000000-0000-4000-8000-000000000009";
const reservationId = "90000000-0000-4000-8000-000000000004";
const animalId = "d0000000-0000-4000-8000-000000000008";
const prefix = "9f320001-0000-4000-8000-0000000000";
const ids = {
  instance: `${prefix}01`,
  draft: `${prefix}02`,
  response: `${prefix}03`,
  event: `${prefix}04`,
  staleEvent: `${prefix}05`,
  instanceCreatedEvent: `${prefix}06`,
  becameDueEvent: `${prefix}07`,
  invitationEvent: `${prefix}08`,
  draftStartedEvent: `${prefix}09`,
} as const;

type QuestionnaireQuestion = {
  key: string;
  type: string;
  required: boolean;
  observationPeriod?: string;
  options?: Array<{ value: string }>;
  rows?: Array<{ key: string }>;
  eventCategories?: Array<{ value: string }>;
  fields?: Array<{
    key: string;
    type: string;
    required: boolean;
    options?: string[];
  }>;
  separateFromDogAssessment?: boolean;
  visibleWhen?: QuestionnaireCondition;
  requiredWhen?: QuestionnaireCondition;
};

type QuestionnaireCondition = {
  question?: string;
  equals?: string;
  notEquals?: string;
  in?: string[];
  anyQuestion?: string[];
  notIn?: string[];
  matrixQuestion?: string;
};

function conditionMatches(
  condition: QuestionnaireCondition,
  answers: Record<string, unknown>,
) {
  if (condition.question) {
    const answer = answers[condition.question];
    if (answer === undefined) return false;
    if (condition.equals !== undefined) return answer === condition.equals;
    if (condition.notEquals !== undefined) return answer !== condition.notEquals;
    if (condition.in) return condition.in.includes(String(answer));
  }
  if (condition.anyQuestion && condition.notIn) {
    return condition.anyQuestion.some((key) =>
      key in answers && !condition.notIn?.includes(String(answers[key])),
    );
  }
  if (condition.matrixQuestion && condition.in) {
    const matrix = answers[condition.matrixQuestion];
    return typeof matrix === "object" && matrix !== null
      ? Object.values(matrix).some((value) => condition.in?.includes(String(value)))
      : false;
  }
  return false;
}

function completeAnswers(questions: QuestionnaireQuestion[]) {
  const answers: Record<string, unknown> = {};
  for (const question of questions) {
    const visible = question.visibleWhen
      ? conditionMatches(question.visibleWhen, answers)
      : true;
    const required = question.requiredWhen
      ? visible && conditionMatches(question.requiredWhen, answers)
      : visible && question.required;
    if (!required) continue;

    switch (question.type) {
      case "single_choice":
        answers[question.key] = question.options?.[0]?.value;
        break;
      case "multi_choice":
        answers[question.key] = [question.options?.[0]?.value];
        break;
      case "short_text":
      case "long_text":
      case "date_or_period":
        answers[question.key] = "Réponse structurée de test";
        break;
      case "decimal":
        answers[question.key] = 25;
        break;
      case "matrix_single_choice":
        answers[question.key] = Object.fromEntries(
          (question.rows ?? []).map((row) => [
            row.key,
            question.options?.[0]?.value,
          ]),
        );
        break;
      case "repeater":
        answers[question.key] = [
          Object.fromEntries(
            (question.fields ?? [])
              .filter((field) => field.required)
              .map((field) => [
                field.key,
                field.key === "category"
                  ? question.eventCategories?.[0]?.value
                  : field.options?.[0] ?? "Réponse structurée de test",
              ]),
          ),
        ];
        break;
      default:
        throw new Error(`Unsupported questionnaire test type: ${question.type}`);
    }
  }
  return answers;
}

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function lastSqlLine(statement: string) {
  return sql(statement)
    .split("\n")
    .findLast((line) => /^\d+$/.test(line));
}

function cleanup() {
  sql(`
    begin;
    set local app.qa_hard_delete = 'on';
    delete from public.post_adoption_questionnaire_events
    where id::text like '9f320001-%'
       or instance_id = ${q(ids.instance)}::uuid;
    delete from public.post_adoption_questionnaire_response_revisions
    where id::text like '9f320001-%'
       or instance_id = ${q(ids.instance)}::uuid;
    delete from public.post_adoption_questionnaire_drafts
    where id::text like '9f320001-%'
       or instance_id = ${q(ids.instance)}::uuid;
    delete from public.post_adoption_questionnaire_instances
    where id::text like '9f320001-%';
    commit;
  `);
}

function remainingCounts() {
  return JSON.parse(
    sql(`
      select json_build_object(
        'events', (
          select count(*) from public.post_adoption_questionnaire_events
          where id::text like '9f320001-%'
             or instance_id = ${q(ids.instance)}::uuid
        ),
        'responses', (
          select count(*) from public.post_adoption_questionnaire_response_revisions
          where id::text like '9f320001-%'
             or instance_id = ${q(ids.instance)}::uuid
        ),
        'drafts', (
          select count(*) from public.post_adoption_questionnaire_drafts
          where id::text like '9f320001-%'
             or instance_id = ${q(ids.instance)}::uuid
        ),
        'instances', (
          select count(*) from public.post_adoption_questionnaire_instances
          where id::text like '9f320001-%'
        )
      )::text;
    `),
  ) as Record<string, number>;
}

function expectCleanupAtZero() {
  for (const [name, count] of Object.entries(remainingCounts())) {
    expect(count, `${name} fixtures must be hard-deleted`).toBe(0);
  }
}

test("post-adoption questionnaire foundation publishes immutable T1/T2 definitions and append-only responses", () => {
  try {
    cleanup();
    expectCleanupAtZero();

    const definitions = JSON.parse(
      sql(`
        select json_agg(json_build_object(
          'code', code,
          'version', version,
          'milestone', milestone,
          'anchorType', anchor_type,
          'anchorOffset', anchor_offset,
          'questionCount', jsonb_array_length(definition->'questions'),
          'definition', definition
        ) order by code)::text
        from public.post_adoption_questionnaire_definitions
        where (code, version) in (('post-adoption-t1', 1), ('post-adoption-t2', 1));
      `),
    ) as Array<{
      code: string;
      version: number;
      milestone: string;
      anchorType: string;
      anchorOffset: string;
      questionCount: number;
      definition: { questions: QuestionnaireQuestion[] };
    }>;

    expect(definitions).toHaveLength(2);
    const t1 = definitions.find((definition) => definition.code === "post-adoption-t1");
    const t2 = definitions.find((definition) => definition.code === "post-adoption-t2");
    expect(t1).toMatchObject({
      version: 1,
      milestone: "t1",
      anchorType: "adoption_completed_at",
      anchorOffset: "60 days",
    });
    expect(t2).toMatchObject({
      version: 1,
      milestone: "t2",
      anchorType: "animal_birth_date",
      anchorOffset: "1 year 3 mons",
    });
    expect(t1?.questionCount).toBe(46);
    expect(t2?.questionCount).toBe(61);

    const question = (
      definition: typeof t1,
      key: string,
    ): QuestionnaireQuestion | undefined =>
      definition?.definition.questions.find((item) => item.key === key);

    const calmQuestion = question(t1, "behavior_calm_return");
    expect(calmQuestion?.options).toHaveLength(5);
    expect(calmQuestion?.options?.map((option) => option.value)).not.toContain(
      "not_observed",
    );

    expect(question(t1, "behavior_novelty")?.options?.at(-1)?.value).toBe(
      "not_exposed",
    );
    expect(question(t1, "behavior_unknown_people")?.options?.at(-1)?.value).toBe(
      "no_encounter",
    );
    expect(question(t1, "behavior_dogs_course")?.options).toHaveLength(5);
    expect(question(t1, "behavior_solitude_duration")?.options).toHaveLength(5);
    expect(question(t1, "behavior_solitude_course")?.options?.map(({ value }) => value)).toEqual([
      "very_well",
      "rather_well",
      "variable",
      "difficult",
      "not_observable",
    ]);
    expect(question(t1, "behavior_management_impact")?.options).toHaveLength(4);
    expect(question(t1, "education_support_status")?.required).toBe(true);
    expect(question(t2, "education_support_status")?.required).toBe(true);
    expect(question(t1, "personality_family_place")?.required).toBe(true);
    expect(question(t2, "personality_family_place")?.required).toBe(true);

    const cleanlinessDay = question(t1, "t1_cleanliness_day");
    expect(cleanlinessDay?.observationPeriod).toBe("last_14_days");
    expect(cleanlinessDay?.options?.map((option) => option.value)).toEqual([
      "0",
      "1_2",
      "3_5",
      "6_10",
      "11_14",
    ]);
    expect(question(t1, "t1_cleanliness_night")?.options?.map(({ value }) => value)).toEqual([
      "0",
      "1_2",
      "3_5",
      "6_10",
      "11_14",
    ]);

    expect(question(t1, "t1_care_handling")?.rows?.map(({ key }) => key)).toEqual([
      "coat",
      "paws",
      "ears",
      "mouth",
    ]);
    expect(question(t1, "t1_satisfaction_overall")?.separateFromDogAssessment).toBe(
      true,
    );

    const foodReasons = question(t2, "t2_food_change_reasons");
    expect(foodReasons?.options?.map((option) => option.value)).toEqual([
      "age",
      "health",
      "tolerance",
      "family_choice",
    ]);
    expect(question(t2, "t2_food_tolerance")?.options).toHaveLength(5);
    expect(question(t2, "t2_notable_events")?.eventCategories).toHaveLength(6);
    expect(question(t2, "t2_sterilization")?.options?.map(({ value }) => value)).toEqual([
      "sterilized",
      "planned",
      "not_planned",
      "undecided",
      "prefer_not_to_answer",
    ]);

    expect(() =>
      sql(`
        update public.post_adoption_questionnaire_definitions
        set title = 'Mutation interdite'
        where code = 'post-adoption-t1' and version = 1;
      `),
    ).toThrow(/immutable/i);

    expect(() =>
      sql(`
        with malformed(definition) as (
          values ('{"schemaVersion":1,"questions":[{"key":"required_question","section":"test","type":"short_text","label":"Question","required":true}]}'::jsonb)
        )
        insert into public.post_adoption_questionnaire_definitions (
          code, version, milestone, title, species, breed,
          anchor_type, anchor_offset, response_window,
          definition, definition_sha256
        )
        select
          'post-adoption-invalid', 1, 't1', 'Invalid', 'dog',
          'Golden Retriever', 'adoption_completed_at', interval '60 days',
          interval '30 days', definition,
          encode(extensions.digest(convert_to(definition::text, 'UTF8'), 'sha256'), 'hex')
        from malformed;
      `),
    ).toThrow(/definitions_(metadata|shape)_check/i);

    expect(
      sql(`
        select public.assert_post_adoption_questionnaire_definition(
          jsonb_set(
            definition,
            '{questions,0,visibleWhen}',
            '{"question":"missing_question","equals":"missing_option"}'::jsonb
          )
        )::text
        from public.post_adoption_questionnaire_definitions
        where code = 'post-adoption-t1' and version = 1;
      `),
    ).toBe("false");

    expect(
      sql(`
        select public.assert_post_adoption_questionnaire_definition(
          jsonb_set(definition, '{questions,0,type}', '"unknown_type"'::jsonb)
        )::text
        from public.post_adoption_questionnaire_definitions
        where code = 'post-adoption-t1' and version = 1;
      `),
    ).toBe("false");

    const validT1Answers = completeAnswers(t1?.definition.questions ?? []);
    const invalidT1MatrixAnswers = structuredClone(validT1Answers);
    const careHandling = invalidT1MatrixAnswers.t1_care_handling as Record<string, unknown>;
    careHandling.undeclared_row = "easy";
    expect(
      sql(`
        select public.validate_post_adoption_questionnaire_answers(
          definition,
          ${q(JSON.stringify(invalidT1MatrixAnswers))}::jsonb
        )::text
        from public.post_adoption_questionnaire_definitions
        where code = 'post-adoption-t1' and version = 1;
      `),
    ).toBe("false");

    const validT2Answers = completeAnswers(t2?.definition.questions ?? []);
    const invalidT2RepeaterAnswers = structuredClone(validT2Answers);
    const notableEvents = invalidT2RepeaterAnswers.t2_notable_events as Array<
      Record<string, unknown>
    >;
    notableEvents[0].undeclared_field = "not allowed";
    expect(
      sql(`
        select public.validate_post_adoption_questionnaire_answers(
          definition,
          ${q(JSON.stringify(invalidT2RepeaterAnswers))}::jsonb
        )::text
        from public.post_adoption_questionnaire_definitions
        where code = 'post-adoption-t2' and version = 1;
      `),
    ).toBe("false");

    const duplicateMultiChoiceAnswers = structuredClone(validT1Answers);
    const educationReasons = duplicateMultiChoiceAnswers.education_support_reasons as string[];
    duplicateMultiChoiceAnswers.education_support_reasons = [
      educationReasons[0],
      educationReasons[0],
    ];
    expect(
      sql(`
        select public.validate_post_adoption_questionnaire_answers(
          definition,
          ${q(JSON.stringify(duplicateMultiChoiceAnswers))}::jsonb
        )::text
        from public.post_adoption_questionnaire_definitions
        where code = 'post-adoption-t1' and version = 1;
      `),
    ).toBe("false");

    expect(() =>
      sql(`
        insert into public.post_adoption_questionnaire_instances (
          id, organization_id, questionnaire_code, questionnaire_version,
          contact_id, reservation_id, animal_id, due_at,
          status, created_by, updated_by
        ) values (
          ${q(ids.instance)}::uuid, ${q(organizationId)}::uuid,
          'post-adoption-t1', 1, ${q(contactId)}::uuid,
          ${q(reservationId)}::uuid, ${q(animalId)}::uuid,
          '2026-08-22 14:30:00+00',
          'planned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
        );
      `),
    ).toThrow(/due date/i);

    expect(() =>
      sql(`
        insert into public.post_adoption_questionnaire_instances (
          id, organization_id, questionnaire_code, questionnaire_version,
          contact_id, reservation_id, animal_id, due_at, invited_at, response_deadline_at,
          status, created_by, updated_by
        ) values (
          ${q(ids.instance)}::uuid, ${q(organizationId)}::uuid,
          'post-adoption-t1', 1, ${q(contactId)}::uuid,
          ${q(reservationId)}::uuid, ${q(animalId)}::uuid,
          '2026-08-21 14:30:00+00', '2026-08-21 14:30:00+00', '2026-09-20 14:30:00+00',
          'suspended', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
        );
      `),
    ).toThrow(/planned state|suspension_check/i);

    sql(`
      insert into public.post_adoption_questionnaire_instances (
        id, organization_id, questionnaire_code, questionnaire_version,
        contact_id, reservation_id, animal_id, due_at,
        status, created_by, updated_by
      ) values (
        ${q(ids.instance)}::uuid, ${q(organizationId)}::uuid,
        'post-adoption-t1', 1, ${q(contactId)}::uuid,
        ${q(reservationId)}::uuid, ${q(animalId)}::uuid,
        '2026-08-21 14:30:00+00',
        'planned', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
      );
    `);

    expect(() =>
      sql(`
        update public.post_adoption_questionnaire_instances
        set status = 'due'
        where id = ${q(ids.instance)}::uuid;
      `),
    ).toThrow(/append-only event/i);

    sql(`
      insert into public.post_adoption_questionnaire_events (
        id, organization_id, instance_id, event_type,
        from_status, to_status, actor_kind, actor_profile_id, details, occurred_at
      ) values
        (${q(ids.instanceCreatedEvent)}::uuid, ${q(organizationId)}::uuid, ${q(ids.instance)}::uuid,
         'instance_created', null, null, 'member', ${q(ownerId)}::uuid, '{}'::jsonb, '2026-08-03 12:00:00+00'),
        (${q(ids.becameDueEvent)}::uuid, ${q(organizationId)}::uuid, ${q(ids.instance)}::uuid,
         'became_due', 'planned', 'due', 'system', null, '{}'::jsonb, '2026-08-21 14:30:00+00'),
        (${q(ids.invitationEvent)}::uuid, ${q(organizationId)}::uuid, ${q(ids.instance)}::uuid,
         'invitation_sent', 'due', 'invited', 'system', null, '{}'::jsonb, '2026-08-21 15:00:00+00'),
        (${q(ids.draftStartedEvent)}::uuid, ${q(organizationId)}::uuid, ${q(ids.instance)}::uuid,
         'draft_started', 'invited', 'in_progress', 'family', null, '{}'::jsonb, '2026-08-21 15:05:00+00');

      insert into public.post_adoption_questionnaire_drafts (
        id, organization_id, instance_id, revision, answers,
        editor_kind, editor_profile_id
      ) values (
        ${q(ids.draft)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.instance)}::uuid, 1,
        '{"behavior_activity":"intermediate"}'::jsonb,
        'member', ${q(ownerId)}::uuid
      );
    `);

    expect(
      lastSqlLine(`
        begin;
        set local role authenticated;
        select set_config('request.jwt.claim.sub', ${q(ownerId)}, true);
        select count(*)
        from public.post_adoption_questionnaire_instances
        where id = ${q(ids.instance)}::uuid;
        rollback;
      `),
    ).toBe("1");

    expect(
      lastSqlLine(`
        begin;
        set local role authenticated;
        select set_config(
          'request.jwt.claim.sub',
          'f3200000-0000-4000-8000-000000000099',
          true
        );
        select count(*)
        from public.post_adoption_questionnaire_instances
        where id = ${q(ids.instance)}::uuid;
        rollback;
      `),
    ).toBe("0");

    expect(() =>
      sql(`
        begin;
        set local role anon;
        select count(*) from public.post_adoption_questionnaire_definitions;
        rollback;
      `),
    ).toThrow(/permission denied/i);

    expect(() =>
      sql(`
        insert into public.post_adoption_questionnaire_response_revisions (
          id, organization_id, instance_id, revision_no,
          definition_sha256, answers, submitted_at,
          submission_source, submitted_by_profile_id
        )
        select
          ${q(ids.response)}::uuid, ${q(organizationId)}::uuid,
          ${q(ids.instance)}::uuid, 1, definition_sha256,
          '{}'::jsonb, '2026-08-22 12:00:00+00', 'member', ${q(ownerId)}::uuid
        from public.post_adoption_questionnaire_definitions
        where code = 'post-adoption-t1' and version = 1;
      `),
    ).toThrow(/does not satisfy/i);

    expect(() =>
      sql(`
        insert into public.post_adoption_questionnaire_response_revisions (
          id, organization_id, instance_id, revision_no,
          definition_sha256, answers, submitted_at,
          submission_source, submitted_by_profile_id
        )
        select
          ${q(ids.response)}::uuid, ${q(organizationId)}::uuid,
          ${q(ids.instance)}::uuid, 1, definition_sha256,
          ${q(JSON.stringify({ ...validT1Answers, behavior_specific_fears: "no" }))}::jsonb,
          '2026-08-22 12:00:00+00', 'member', ${q(ownerId)}::uuid
        from public.post_adoption_questionnaire_definitions
        where code = 'post-adoption-t1' and version = 1;
      `),
    ).toThrow(/does not satisfy/i);

    expect(() =>
      sql(`
        insert into public.post_adoption_questionnaire_response_revisions (
          id, organization_id, instance_id, revision_no,
          definition_sha256, answers, submitted_at,
          submission_source, submitted_by_profile_id,
          completion_started_at
        )
        select
          ${q(ids.response)}::uuid, ${q(organizationId)}::uuid,
          ${q(ids.instance)}::uuid, 1, definition_sha256,
          ${q(JSON.stringify(validT1Answers))}::jsonb,
          '2026-08-22 12:00:00+00', 'member', ${q(ownerId)}::uuid,
          '2026-08-22 11:00:00+00'
        from public.post_adoption_questionnaire_definitions
        where code = 'post-adoption-t1' and version = 1;
      `),
    ).toThrow(/completion_check/i);

    sql(`
      insert into public.post_adoption_questionnaire_response_revisions (
        id, organization_id, instance_id, revision_no,
        definition_sha256, answers, submitted_at,
        submission_source, submitted_by_profile_id
      )
      select
        ${q(ids.response)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.instance)}::uuid, 1, definition_sha256,
        ${q(JSON.stringify(validT1Answers))}::jsonb,
        '2026-08-22 12:00:00+00', 'member', ${q(ownerId)}::uuid
      from public.post_adoption_questionnaire_definitions
      where code = 'post-adoption-t1' and version = 1;

      insert into public.post_adoption_questionnaire_events (
        id, organization_id, instance_id, event_type,
        from_status, to_status, response_revision_no,
        actor_kind, actor_profile_id, details, occurred_at
      ) values (
        ${q(ids.event)}::uuid, ${q(organizationId)}::uuid,
        ${q(ids.instance)}::uuid, 'response_submitted',
        'in_progress', 'submitted', 1,
        'member', ${q(ownerId)}::uuid, '{}'::jsonb, '2026-08-22 12:05:00+00'
      );
    `);

    expect(
      sql(`
        select status from public.post_adoption_questionnaire_instances
        where id = ${q(ids.instance)}::uuid;
      `),
    ).toBe("submitted");
    expect(() =>
      sql(`
        insert into public.post_adoption_questionnaire_events (
          id, organization_id, instance_id, event_type,
          from_status, to_status, response_revision_no,
          actor_kind, actor_profile_id, details, occurred_at
        ) values (
          ${q(ids.staleEvent)}::uuid, ${q(organizationId)}::uuid,
          ${q(ids.instance)}::uuid, 'response_submitted',
          'in_progress', 'submitted', 1,
          'member', ${q(ownerId)}::uuid, '{}'::jsonb, '2026-08-22 12:05:00+00'
        );
      `),
    ).toThrow(/stale or inconsistent/i);

    expect(
      lastSqlLine(`
        begin;
        set local role authenticated;
        select set_config('request.jwt.claim.sub', ${q(ownerId)}, true);
        select
          (select count(*) from public.post_adoption_questionnaire_instances where id = ${q(ids.instance)}::uuid)
          + (select count(*) from public.post_adoption_questionnaire_drafts where id = ${q(ids.draft)}::uuid)
          + (select count(*) from public.post_adoption_questionnaire_response_revisions where id = ${q(ids.response)}::uuid)
          + (select count(*) from public.post_adoption_questionnaire_events where id = ${q(ids.event)}::uuid);
        rollback;
      `),
    ).toBe("4");

    expect(
      lastSqlLine(`
        begin;
        set local role authenticated;
        select set_config(
          'request.jwt.claim.sub',
          'f3200000-0000-4000-8000-000000000099',
          true
        );
        select
          (select count(*) from public.post_adoption_questionnaire_instances where id = ${q(ids.instance)}::uuid)
          + (select count(*) from public.post_adoption_questionnaire_drafts where id = ${q(ids.draft)}::uuid)
          + (select count(*) from public.post_adoption_questionnaire_response_revisions where id = ${q(ids.response)}::uuid)
          + (select count(*) from public.post_adoption_questionnaire_events where id = ${q(ids.event)}::uuid);
        rollback;
      `),
    ).toBe("0");

    expect(() =>
      sql(`
        update public.post_adoption_questionnaire_response_revisions
        set answers = '{}'::jsonb
        where id = ${q(ids.response)}::uuid;
      `),
    ).toThrow(/immutable/i);
    expect(() =>
      sql(`
        update public.post_adoption_questionnaire_events
        set details = '{"changed":true}'::jsonb
        where id = ${q(ids.event)}::uuid;
      `),
    ).toThrow(/immutable/i);
    expect(() =>
      sql(`
        delete from public.post_adoption_questionnaire_response_revisions
        where id = ${q(ids.response)}::uuid;
      `),
    ).toThrow(/immutable/i);
    expect(() =>
      sql(`
        delete from public.post_adoption_questionnaire_events
        where id = ${q(ids.event)}::uuid;
      `),
    ).toThrow(/immutable/i);

    const grants = JSON.parse(
      sql(`
        select coalesce(json_agg(json_build_object(
          'table', table_name,
          'grantee', grantee,
          'privilege', privilege_type
        ) order by table_name, grantee, privilege_type), '[]'::json)::text
        from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name like 'post_adoption_questionnaire_%'
          and grantee in ('anon', 'authenticated')
          and privilege_type <> 'SELECT';
      `),
    );
    expect(grants).toEqual([]);
  } finally {
    cleanup();
    expectCleanupAtZero();
  }
});
