import { expect, test } from "@playwright/test";

import { runE2eSqlSync } from "./helpers/supabase";

const sql = (statement: string) => runE2eSqlSync(statement);

test("installs departure planning tables, RPCs and protected calendar projection", () => {
  const result = JSON.parse(sql(`
    select json_build_object(
      'plan', to_regclass('public.departure_plans') is not null,
      'slot', to_regclass('public.departure_slots') is not null,
      'event', to_regclass('public.departure_events') is not null,
      'createPlan', to_regprocedure('public.create_departure_plan(text,integer,jsonb,uuid)') is not null,
      'bookPublic', to_regprocedure('public.book_departure_public_session(text,uuid,uuid)') is not null,
      'eventProjectionColumn', exists(
        select 1 from information_schema.columns
        where table_schema='public' and table_name='events' and column_name='departure_slot_id'
      ),
      'browserAccessMutations', (
        select count(*)::integer
        from unnest(array['anon','authenticated']) role_name
        cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) privilege_name
        where has_table_privilege(role_name,'public.departure_public_accesses',privilege_name)
      )
    )::text;
  `));
  expect(result).toEqual({
    plan: true,
    slot: true,
    event: true,
    createPlan: true,
    bookPublic: true,
    eventProjectionColumn: true,
    browserAccessMutations: 0,
  });
});
