import { expect, test, type Page } from "@playwright/test";
import { formatLitterJournalBusinessDate } from "../../src/features/litter-journal/date";
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, runE2eSqlSync } from "./helpers/supabase";
import { createPlannedLitterCareTask, createPlannedLitterCareWindow, createResolvedLitterCareTask, createTestAnimal, createTestLitter, createTestOrganization } from "./helpers/fixtures/breeding-fixtures";
import { withE2eFixtures } from "./helpers/fixtures/fixture-registry";

test.setTimeout(240_000);
const organizationId="20000000-0000-4000-8000-000000000001", ownerId="10000000-0000-4000-8000-000000000001";
const sql=(value:string)=>runE2eSqlSync(value), day=formatLitterJournalBusinessDate(new Date());
function unfoldICalendar(value:string){return value.replace(/\r\n[ \t]/g,"")}
async function login(page:Page){await page.goto('/login');await page.getByLabel('Email').fill(E2E_OWNER_EMAIL);await page.getByLabel('Mot de passe').fill(E2E_OWNER_PASSWORD);await page.getByRole('button',{name:'Se connecter'}).click();await expect(page).not.toHaveURL(/\/login$/)}
test('calendrier global isolé',async({page})=>withE2eFixtures(sql,async(fixtures)=>{
  const label=fixtures.namespace.slice(-8);
  const mother=await createTestAnimal(sql,fixtures,{organizationId,ownerId,callName:`E2E mère ${fixtures.namespace}`});
  const alpha=await createTestLitter(sql,fixtures,{organizationId,ownerId,motherId:mother,name:`E2E Alpha ${label}`});
  const bravo=await createTestLitter(sql,fixtures,{organizationId,ownerId,motherId:mother,name:`E2E Bravo ${label}`});
  await createPlannedLitterCareTask(sql,fixtures,{organizationId,ownerId,litterId:alpha,day,title:`E2E Alpha visite ${label}`});
  await createPlannedLitterCareTask(sql,fixtures,{organizationId,ownerId,litterId:bravo,day,title:`E2E Bravo vaccin ${label}`});
  await createPlannedLitterCareWindow(sql,fixtures,{organizationId,ownerId,litterId:alpha,day,startsOn:day,endsOn:day,title:`E2E fenêtre ${label}`});
  await createResolvedLitterCareTask(sql,fixtures,{organizationId,ownerId,litterId:bravo,day,title:`E2E traitée ${label}`});
  const foreignOrg=await createTestOrganization(sql,fixtures);
  const foreignMother=await createTestAnimal(sql,fixtures,{organizationId:foreignOrg,ownerId,callName:`E2E étrangère mère ${fixtures.namespace}`});
  const foreignLitter=await createTestLitter(sql,fixtures,{organizationId:foreignOrg,ownerId,motherId:foreignMother,name:`E2E étrangère ${label}`});
  await createPlannedLitterCareTask(sql,fixtures,{organizationId:foreignOrg,ownerId,litterId:foreignLitter,day,title:`E2E étrangère secrète ${label}`});
  const before=sql('select count(*)::text from public.litter_care_tasks'); await login(page); await page.goto('/calendar');
  for(const title of [`E2E Alpha visite ${label}`,`E2E Bravo vaccin ${label}`,`E2E fenêtre ${label}`])await expect(page.getByText(title)).toBeVisible();
  for(const title of [`E2E traitée ${label}`,`E2E étrangère secrète ${label}`])await expect(page.getByText(title)).toHaveCount(0);
  await page.getByRole('link',{name:'Semaine'}).click();await page.getByRole('link',{name:'Agenda'}).click();const response=await page.request.get('/calendar/export');const ics=await response.text(), unfolded=unfoldICalendar(ics);expect(response.headers()['content-type']).toBe('text/calendar; charset=utf-8');expect(response.headers()['cache-control']).toBe('private, no-store');for(const marker of ['BEGIN:VCALENDAR','BEGIN:VEVENT','END:VEVENT','END:VCALENDAR'])expect(ics).toContain(marker);
  for(const title of [`E2E Alpha visite ${label}`,`E2E Bravo vaccin ${label}`,`E2E fenêtre ${label}`])expect(unfolded).toContain(title);
  for(const value of [`E2E traitée ${label}`,`E2E étrangère secrète ${label}`,alpha,foreignLitter])expect(unfolded).not.toContain(value);expect(sql('select count(*)::text from public.litter_care_tasks')).toBe(before);const anon=await page.context().browser()!.newContext();expect((await anon.request.get('http://127.0.0.1:3100/calendar/export')).url()).toContain('/login');await anon.close();
}));
