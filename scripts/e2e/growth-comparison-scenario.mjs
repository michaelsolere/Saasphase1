const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";

function uuid(category, index) {
  return `d3c9${category.toString(16).padStart(4, "0")}-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

function q(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function uuidList(values) {
  return values.map((value) => `${q(value)}::uuid`).join(", ");
}

const litterA = {
  id: uuid(1, 1),
  name: "Démonstration croissance — Nova × Orion",
  birthDate: "2026-06-01",
  birthHourUtc: 8,
  mother: { id: uuid(2, 1), name: "Nova", sex: "female" },
  father: { id: uuid(2, 2), name: "Orion", sex: "male" },
  whelpingSessionId: uuid(5, 1),
  puppies: [
    { id: uuid(3, 1), name: "Alba", sex: "female", collar: "Rose framboise", birthWeight: 380 },
    { id: uuid(3, 2), name: "Bosco", sex: "male", collar: "Bleu azur", birthWeight: 360 },
    { id: uuid(3, 3), name: "Céleste", sex: "female", collar: "Violet", birthWeight: 250 },
    { id: uuid(3, 4), name: "Django", sex: "male", collar: "Vert émeraude", birthWeight: 400 },
  ],
};

const litterB = {
  id: uuid(1, 2),
  name: "Démonstration comparaison — Vega × Sirius",
  birthDate: "2026-06-15",
  birthHourUtc: 9,
  mother: { id: uuid(2, 3), name: "Vega", sex: "female" },
  father: { id: uuid(2, 4), name: "Sirius", sex: "male" },
  whelpingSessionId: uuid(5, 2),
  puppies: [
    { id: uuid(4, 1), name: "Éclipse", sex: "female", collar: "Orange", birthWeight: 470 },
    { id: uuid(4, 2), name: "Falko", sex: "male", collar: "Bleu marine", birthWeight: 500 },
    { id: uuid(4, 3), name: "Gaïa", sex: "female", collar: "Jaune soleil", birthWeight: 450 },
    { id: uuid(4, 4), name: "Helios", sex: "male", collar: "Rouge", birthWeight: 520 },
    { id: uuid(4, 5), name: "Iris", sex: "female", collar: "Turquoise", birthWeight: 480 },
  ],
};

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function routineWeight(litter, puppyIndex, day) {
  const birth = litter.puppies[puppyIndex].birthWeight;
  if (litter === litterA && puppyIndex === 2) {
    if (day <= 9) return birth + 5 + day * 30;
    if (day <= 12) return 548 + (day - 10) * 2;
    return 552 + (day - 12) * 32;
  }
  const daily = litter === litterA ? [36, 34, 32, 37][puppyIndex] : [37, 38, 36, 39, 37][puppyIndex];
  return birth + 10 + day * daily;
}

const litters = [litterA, litterB];
const parents = litters.flatMap((litter) => [litter.mother, litter.father]);
const puppies = litters.flatMap((litter) => litter.puppies);
const events = [];
const births = [];
const birthMeasurements = [];
const weighingSessions = [];
const routineMeasurements = [];

for (const [litterIndex, litter] of litters.entries()) {
  const eventBase = litterIndex === 0 ? 1 : 101;
  const itemBase = litterIndex === 0 ? 1 : 101;
  for (const [puppyIndex, puppy] of litter.puppies.entries()) {
    const minute = puppyIndex * 12;
    const occurredAt = `${litter.birthDate}T${String(litter.birthHourUtc).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`;
    const event = { id: uuid(6, eventBase + puppyIndex), litter, puppy, sequence: puppyIndex + 1, occurredAt };
    const birth = { id: uuid(7, itemBase + puppyIndex), event, litter, puppy, order: puppyIndex + 1 };
    events.push(event);
    births.push(birth);
    birthMeasurements.push({
      id: uuid(8, itemBase + puppyIndex),
      birth,
      measuredAt: occurredAt,
      grams: puppy.birthWeight,
    });
  }
  events.push({
    id: uuid(6, eventBase + litter.puppies.length),
    litter,
    puppy: null,
    sequence: litter.puppies.length + 1,
    occurredAt: `${litter.birthDate}T${String(litter.birthHourUtc + 1).padStart(2, "0")}:15:00Z`,
  });

  for (let day = 0; day <= 30; day += 1) {
    const sessionIndex = (litterIndex === 0 ? 1 : 101) + day;
    const session = {
      id: uuid(9, sessionIndex),
      litter,
      day,
      measuredAt: `${addDays(litter.birthDate, day)}T14:00:00Z`,
    };
    weighingSessions.push(session);
    for (const [puppyIndex, puppy] of litter.puppies.entries()) {
      if (litter === litterB && ((day === 7 && puppyIndex === 4) || (day === 21 && puppyIndex === 1))) continue;
      const sequence = litterIndex === 0 ? day * 4 + puppyIndex + 1 : 1001 + day * 5 + puppyIndex;
      routineMeasurements.push({
        id: uuid(10, sequence),
        session,
        puppy,
        grams: routineWeight(litter, puppyIndex, day),
      });
    }
  }
}

export const growthComparisonScenario = {
  scenarioId: "growth-comparison",
  labelPrefix: "DURABLE_DEMO_GROWTH_V1",
  uuidPrefix: "d3c9",
  cleanupOrder: [
    "litter_weight_commands",
    "animal_weight_measurements",
    "litter_weighing_sessions",
    "whelping_commands",
    "whelping_births",
    "whelping_events",
    "offspring_animals",
    "whelping_sessions",
    "litters",
    "parent_animals",
  ],
  litters,
  incompleteDays: [
    { ageDay: 7, missingAnimalId: litterB.puppies[4].id, coverage: "4/5" },
    { ageDay: 21, missingAnimalId: litterB.puppies[1].id, coverage: "4/5" },
  ],
  directIds: {
    animals: [...parents, ...puppies].map((animal) => animal.id),
    litters: litters.map((litter) => litter.id),
    whelping_sessions: litters.map((litter) => litter.whelpingSessionId),
    whelping_events: events.map((event) => event.id),
    whelping_births: births.map((birth) => birth.id),
    litter_weighing_sessions: weighingSessions.map((session) => session.id),
    animal_weight_measurements: [...birthMeasurements, ...routineMeasurements].map((measurement) => measurement.id),
  },
  expectedCounts: {
    animals: 13,
    litters: 2,
    whelping_sessions: 2,
    whelping_events: 11,
    whelping_births: 9,
    litter_weighing_sessions: 62,
    animal_weight_measurements: 286,
    birth_measurements: 9,
    routine_measurements: 277,
    litter_weight_commands: 0,
    whelping_commands: 0,
  },
};

export function growthCreateSql() {
  const parentValues = parents.map((animal) => `(
    ${q(animal.id)}::uuid, ${q(organizationId)}::uuid, ${q(animal.name)}, 'dog', 'Golden Retriever',
    ${q(animal.sex)}, 'breeding', 'owned', true, ${q(`${growthComparisonScenario.labelPrefix} parent`)},
    ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
  )`).join(",\n");
  const litterValues = litters.map((litter) => `(
    ${q(litter.id)}::uuid, ${q(organizationId)}::uuid, ${q(litter.name)}, 'dog', 'Golden Retriever',
    ${q(litter.mother.id)}::uuid, ${q(litter.father.id)}::uuid, 'born', ${q(litter.birthDate)}::date,
    ${litter.puppies.length}, ${litter.puppies.filter((puppy) => puppy.sex === "male").length},
    ${litter.puppies.filter((puppy) => puppy.sex === "female").length}, ${litter.puppies.length},
    ${q(`${growthComparisonScenario.labelPrefix} complete durable litter`)},
    ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
  )`).join(",\n");
  const sessionValues = litters.map((litter) => `(
    ${q(litter.whelpingSessionId)}::uuid, ${q(organizationId)}::uuid, ${q(litter.id)}::uuid,
    ${q(litter.mother.id)}::uuid, 'closed', ${q(`${litter.birthDate}T${String(litter.birthHourUtc - 1).padStart(2, "0")}:30:00Z`)}::timestamptz,
    ${q(`${litter.birthDate}T${String(litter.birthHourUtc + 1).padStart(2, "0")}:15:00Z`)}::timestamptz,
    'Europe/Paris', ${q(`${growthComparisonScenario.labelPrefix} closed chronology`)},
    ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
  )`).join(",\n");
  const eventValues = events.map((event) => `(
    ${q(event.id)}::uuid, ${q(organizationId)}::uuid, ${q(event.litter.whelpingSessionId)}::uuid,
    ${event.sequence}, ${q(event.occurredAt)}::timestamptz, ${q(event.puppy ? "birth" : "session_closed")},
    ${q(event.puppy ? `${growthComparisonScenario.labelPrefix} naissance ${event.puppy.name}` : `${growthComparisonScenario.labelPrefix} clôture`)},
    ${q(ownerId)}::uuid
  )`).join(",\n");
  const puppyValues = litters.flatMap((litter) => litter.puppies.map((puppy, index) => `(
    ${q(puppy.id)}::uuid, ${q(organizationId)}::uuid, ${q(litter.id)}::uuid,
    ${q(litter.mother.id)}::uuid, ${q(litter.father.id)}::uuid, ${q(puppy.name)},
    ${q(`${puppy.name} de la démonstration`)}, 'dog', 'Golden Retriever', ${q(puppy.sex)},
    'born', 'produced', ${q(litter.birthDate)}::date,
    ${q(`${String(litter.birthHourUtc + 2).padStart(2, "0")}:${String(index * 12).padStart(2, "0")}:00`)}::time,
    ${index + 1}, ${puppy.birthWeight}, ${q(puppy.collar)}, ${q(puppy.collar)},
    ${q(`${growthComparisonScenario.labelPrefix} chiot vivant`)}, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid
  )`)).join(",\n");
  const birthValues = births.map((birth) => `(
    ${q(birth.id)}::uuid, ${q(organizationId)}::uuid, ${q(birth.litter.whelpingSessionId)}::uuid,
    ${q(birth.event.id)}::uuid, ${q(birth.puppy.id)}::uuid, ${birth.order}, ${q(birth.puppy.sex)},
    'alive', ${q(birth.puppy.collar)}, ${q(ownerId)}::uuid
  )`).join(",\n");
  const birthWeightValues = birthMeasurements.map((measurement) => `(
    ${q(measurement.id)}::uuid, ${q(organizationId)}::uuid, ${q(measurement.birth.puppy.id)}::uuid,
    ${q(measurement.measuredAt)}::timestamptz, ${measurement.grams}, 'birth', ${q(measurement.birth.id)}::uuid,
    ${q(`${growthComparisonScenario.labelPrefix} vraie mesure de naissance`)}, ${q(ownerId)}::uuid
  )`).join(",\n");
  const weighingValues = weighingSessions.map((session) => `(
    ${q(session.id)}::uuid, ${q(organizationId)}::uuid, ${q(session.litter.id)}::uuid,
    ${q(session.measuredAt)}::timestamptz, 'Europe/Paris',
    ${q(`${growthComparisonScenario.labelPrefix} J${session.day}`)}, ${q(ownerId)}::uuid
  )`).join(",\n");
  const routineValues = routineMeasurements.map((measurement) => `(
    ${q(measurement.id)}::uuid, ${q(organizationId)}::uuid, ${q(measurement.puppy.id)}::uuid,
    ${q(measurement.session.measuredAt)}::timestamptz, ${measurement.grams}, 'routine',
    ${q(measurement.session.id)}::uuid, ${q(`${growthComparisonScenario.labelPrefix} mesure réelle`)},
    ${q(ownerId)}::uuid
  )`).join(",\n");

  return `
    begin;
    insert into public.animals (
      id, organization_id, call_name, species, breed, sex, status, ownership_status,
      is_breeder, notes, created_by, updated_by
    ) values ${parentValues};

    insert into public.litters (
      id, organization_id, name, species, breed, mother_id, father_id, status,
      actual_birth_date, born_total_count, born_male_count, born_female_count,
      alive_count, notes, created_by, updated_by
    ) values ${litterValues};

    insert into public.whelping_sessions (
      id, organization_id, litter_id, mother_id, status, started_at, ended_at,
      timezone_name, note, created_by, updated_by
    ) values ${sessionValues};

    insert into public.whelping_events (
      id, organization_id, session_id, sequence_no, occurred_at, event_type, note, author_id
    ) values ${eventValues};

    insert into public.animals (
      id, organization_id, litter_id, mother_id, father_id, call_name, official_name,
      species, breed, sex, status, ownership_status, birth_date, birth_time,
      birth_order, birth_weight_grams, collar_color_initial, collar_color_current,
      notes, created_by, updated_by
    ) values ${puppyValues};

    insert into public.whelping_births (
      id, organization_id, session_id, event_id, animal_id, birth_order,
      sex, viability, initial_collar_color, created_by
    ) values ${birthValues};

    insert into public.animal_weight_measurements (
      id, organization_id, animal_id, measured_at, grams, measurement_kind,
      source_birth_id, note, created_by
    ) values ${birthWeightValues};

    insert into public.litter_weighing_sessions (
      id, organization_id, litter_id, measured_at, timezone_name, note, created_by
    ) values ${weighingValues};

    insert into public.animal_weight_measurements (
      id, organization_id, animal_id, measured_at, grams, measurement_kind,
      litter_weighing_session_id, note, created_by
    ) values ${routineValues};
    commit;
  `;
}

export function growthCountsSql() {
  const litterIds = growthComparisonScenario.directIds.litters;
  return `select json_build_object(
    'animals', (select count(*) from public.animals where id::text like ${q(`${growthComparisonScenario.uuidPrefix}%`)} or litter_id in (${uuidList(litterIds)}) or notes like ${q(`${growthComparisonScenario.labelPrefix}%`)}),
    'litters', (select count(*) from public.litters where id::text like ${q(`${growthComparisonScenario.uuidPrefix}%`)} or name in (${litters.map((litter) => q(litter.name)).join(", ")}) or notes like ${q(`${growthComparisonScenario.labelPrefix}%`)}),
    'whelping_sessions', (select count(*) from public.whelping_sessions where id::text like ${q(`${growthComparisonScenario.uuidPrefix}%`)} or litter_id in (${uuidList(litterIds)})),
    'whelping_events', (select count(*) from public.whelping_events where id::text like ${q(`${growthComparisonScenario.uuidPrefix}%`)} or session_id in (${uuidList(growthComparisonScenario.directIds.whelping_sessions)})),
    'whelping_births', (select count(*) from public.whelping_births where id::text like ${q(`${growthComparisonScenario.uuidPrefix}%`)} or animal_id in (${uuidList(puppies.map((puppy) => puppy.id))})),
    'litter_weighing_sessions', (select count(*) from public.litter_weighing_sessions where id::text like ${q(`${growthComparisonScenario.uuidPrefix}%`)} or litter_id in (${uuidList(litterIds)})),
    'animal_weight_measurements', (select count(*) from public.animal_weight_measurements where id::text like ${q(`${growthComparisonScenario.uuidPrefix}%`)} or animal_id in (${uuidList(puppies.map((puppy) => puppy.id))})),
    'birth_measurements', (select count(*) from public.animal_weight_measurements where animal_id in (${uuidList(puppies.map((puppy) => puppy.id))}) and measurement_kind = 'birth'),
    'routine_measurements', (select count(*) from public.animal_weight_measurements where animal_id in (${uuidList(puppies.map((puppy) => puppy.id))}) and measurement_kind = 'routine'),
    'litter_weight_commands', (select count(*) from public.litter_weight_commands where litter_id in (${uuidList(litterIds)}) or client_command_id::text like ${q(`${growthComparisonScenario.uuidPrefix}%`)}),
    'whelping_commands', (select count(*) from public.whelping_commands where litter_id in (${uuidList(litterIds)}) or client_command_id::text like ${q(`${growthComparisonScenario.uuidPrefix}%`)})
  );`;
}

export function growthIntegritySql() {
  const puppyIdsA = litterA.puppies.map((puppy) => puppy.id);
  const puppyIdsB = litterB.puppies.map((puppy) => puppy.id);
  return `select json_build_object(
    'invalidLitters', (select count(*) from public.litters where id in (${uuidList([litterA.id, litterB.id])}) and not (
      organization_id = ${q(organizationId)}::uuid and deleted_at is null and status = 'born'
      and litter_weighing_schedule_policy_source = 'recommended'
      and litter_weighing_schedule_policy_snapshot is not null
      and ((id = ${q(litterA.id)}::uuid and name = ${q(litterA.name)} and mother_id = ${q(litterA.mother.id)}::uuid and father_id = ${q(litterA.father.id)}::uuid and actual_birth_date = ${q(litterA.birthDate)}::date and alive_count = 4)
        or (id = ${q(litterB.id)}::uuid and name = ${q(litterB.name)} and mother_id = ${q(litterB.mother.id)}::uuid and father_id = ${q(litterB.father.id)}::uuid and actual_birth_date = ${q(litterB.birthDate)}::date and alive_count = 5)))),
    'invalidParents', (select count(*) from public.animals where id in (${uuidList(parents.map((animal) => animal.id))}) and not (organization_id = ${q(organizationId)}::uuid and deleted_at is null and status = 'breeding' and ownership_status = 'owned')),
    'invalidPuppies', (select count(*) from public.animals where id in (${uuidList(puppies.map((puppy) => puppy.id))}) and not (organization_id = ${q(organizationId)}::uuid and deleted_at is null and death_date is null and status = 'born' and ownership_status = 'produced' and is_external = false and birth_date is not null and litter_id in (${uuidList([litterA.id, litterB.id])}) and mother_id is not null and father_id is not null and collar_color_initial is not null and collar_color_current is not null)),
    'invalidWhelpingSessions', (select count(*) from public.whelping_sessions where id in (${uuidList(growthComparisonScenario.directIds.whelping_sessions)}) and not (organization_id = ${q(organizationId)}::uuid and status = 'closed' and ended_at is not null and litter_id in (${uuidList([litterA.id, litterB.id])}))),
    'invalidBirths', (select count(*) from public.whelping_births birth join public.animals animal on animal.id = birth.animal_id join public.whelping_events event on event.id = birth.event_id where birth.id in (${uuidList(births.map((birth) => birth.id))}) and not (birth.organization_id = ${q(organizationId)}::uuid and birth.viability = 'alive' and birth.session_id = event.session_id and event.event_type = 'birth' and animal.litter_id in (${uuidList([litterA.id, litterB.id])}) and animal.birth_order = birth.birth_order and animal.sex = birth.sex)),
    'invalidBirthMeasurements', (select count(*) from public.animal_weight_measurements measurement join public.whelping_births birth on birth.id = measurement.source_birth_id join public.animals animal on animal.id = measurement.animal_id where measurement.id in (${uuidList(birthMeasurements.map((measurement) => measurement.id))}) and not (measurement.organization_id = ${q(organizationId)}::uuid and measurement.measurement_kind = 'birth' and measurement.litter_weighing_session_id is null and measurement.animal_id = birth.animal_id and measurement.grams = animal.birth_weight_grams)),
    'invalidRoutineSessions', (select count(*) from public.litter_weighing_sessions where id in (${uuidList(weighingSessions.map((session) => session.id))}) and not (organization_id = ${q(organizationId)}::uuid and litter_id in (${uuidList([litterA.id, litterB.id])}) and timezone_name = 'Europe/Paris')),
    'invalidRoutineMeasurements', (select count(*) from public.animal_weight_measurements measurement join public.litter_weighing_sessions session on session.id = measurement.litter_weighing_session_id join public.animals animal on animal.id = measurement.animal_id where measurement.id in (${uuidList(routineMeasurements.map((measurement) => measurement.id))}) and not (measurement.organization_id = ${q(organizationId)}::uuid and measurement.measurement_kind = 'routine' and measurement.source_birth_id is null and measurement.measured_at = session.measured_at and animal.litter_id = session.litter_id)),
    'litterASessions', (select count(*) from public.litter_weighing_sessions where litter_id = ${q(litterA.id)}::uuid),
    'litterARoutine', (select count(*) from public.animal_weight_measurements measurement join public.animals animal on animal.id = measurement.animal_id where animal.litter_id = ${q(litterA.id)}::uuid and measurement.measurement_kind = 'routine'),
    'litterBSessions', (select count(*) from public.litter_weighing_sessions where litter_id = ${q(litterB.id)}::uuid),
    'litterBRoutine', (select count(*) from public.animal_weight_measurements measurement join public.animals animal on animal.id = measurement.animal_id where animal.litter_id = ${q(litterB.id)}::uuid and measurement.measurement_kind = 'routine'),
    'litterBCoverage4Days', (select count(*) from (select session.id from public.litter_weighing_sessions session join public.animal_weight_measurements measurement on measurement.litter_weighing_session_id = session.id where session.litter_id = ${q(litterB.id)}::uuid group by session.id having count(*) = 4) coverage),
    'litterBWrongCoverageDays', (select count(*) from (select session.id, ((session.measured_at::date - ${q(litterB.birthDate)}::date)) age_day, count(measurement.id) coverage from public.litter_weighing_sessions session left join public.animal_weight_measurements measurement on measurement.litter_weighing_session_id = session.id where session.litter_id = ${q(litterB.id)}::uuid group by session.id having (session.measured_at::date - ${q(litterB.birthDate)}::date) in (7, 21) and count(measurement.id) <> 4) wrong),
    'litterAAnimals', (select count(*) from public.animals where id in (${uuidList(puppyIdsA)}) and litter_id = ${q(litterA.id)}::uuid),
    'litterBAnimals', (select count(*) from public.animals where id in (${uuidList(puppyIdsB)}) and litter_id = ${q(litterB.id)}::uuid)
  );`;
}

export function growthCleanupSql() {
  const direct = growthComparisonScenario.directIds;
  const offspringIds = puppies.map((puppy) => puppy.id);
  return `begin;
    delete from public.litter_weight_commands where litter_id in (${uuidList(direct.litters)}) or client_command_id::text like ${q(`${growthComparisonScenario.uuidPrefix}%`)};
    delete from public.animal_weight_measurements where id in (${uuidList(direct.animal_weight_measurements)});
    delete from public.litter_weighing_sessions where id in (${uuidList(direct.litter_weighing_sessions)});
    delete from public.whelping_commands where litter_id in (${uuidList(direct.litters)}) or client_command_id::text like ${q(`${growthComparisonScenario.uuidPrefix}%`)};
    delete from public.whelping_births where id in (${uuidList(direct.whelping_births)});
    delete from public.whelping_events where id in (${uuidList(direct.whelping_events)});
    delete from public.animals where id in (${uuidList(offspringIds)});
    delete from public.whelping_sessions where id in (${uuidList(direct.whelping_sessions)});
    delete from public.litters where id in (${uuidList(direct.litters)});
    delete from public.animals where id in (${uuidList(parents.map((animal) => animal.id))});
    commit;`;
}
