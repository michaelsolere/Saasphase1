alter table public.litters
  add column available_from date;

comment on column public.litters.available_from is
  'Première date saisie manuellement à partir de laquelle les chiots de la portée peuvent commencer à quitter l’élevage.';
