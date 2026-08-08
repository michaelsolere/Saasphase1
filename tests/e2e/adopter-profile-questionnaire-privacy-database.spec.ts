import { expect, test } from "@playwright/test";

import { runE2eSqlSync } from "./helpers/supabase";

const ownerId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";
const viewerId = "10000000-0000-4000-8000-000000000003";

function scalar(sql: string) {
  return runE2eSqlSync(sql)
    .trim()
    .split("\n")
    .filter((line) => line && !["BEGIN", "SET", "ROLLBACK", "COMMIT", "RESET"].includes(line))
    .at(-1) ?? "";
}

function countFor(profileId: string, relation: string) {
  return scalar(`
    begin;
    set local role authenticated;
    set local "request.jwt.claim.sub" = '${profileId}';
    select count(*) from ${relation};
    rollback;
  `);
}

test("owner/admin lisent les réponses tandis que member/viewer ne lisent que le résumé", () => {
  const ownerDetails = countFor(ownerId, "public.adopter_profile_questionnaire_instances");

  expect(countFor(memberId, "public.adopter_profile_questionnaire_instances")).toBe("0");
  expect(countFor(viewerId, "public.adopter_profile_questionnaire_instances")).toBe("0");
  expect(countFor(memberId, "public.adopter_profile_questionnaire_events")).toBe("0");
  expect(countFor(viewerId, "public.adopter_profile_questionnaire_events")).toBe("0");
  expect(countFor(memberId, "public.read_adopter_profile_questionnaire_summaries(null)")).toBe(ownerDetails);
  expect(countFor(viewerId, "public.read_adopter_profile_questionnaire_summaries(null)")).toBe(ownerDetails);

  expect(scalar("select has_function_privilege('anon', 'public.read_adopter_profile_questionnaire_summaries(uuid[])', 'EXECUTE');")).toBe("f");
  expect(scalar("select has_function_privilege('authenticated', 'public.read_adopter_profile_questionnaire_summaries(uuid[])', 'EXECUTE');")).toBe("t");
  expect(scalar(`
    select string_agg(parameter_name, ',' order by ordinal_position)
    from information_schema.parameters
    where specific_schema = 'public'
      and specific_name like 'read_adopter_profile_questionnaire_summaries_%'
      and parameter_mode = 'OUT';
  `)).not.toMatch(/final_answers|draft_answers|waiver_reason|access_seed/);
});
