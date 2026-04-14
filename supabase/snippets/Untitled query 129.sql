select
  (select count(*) from public.walkins) as walkins_count,
  (select count(*) from public.tv_walkins) as tv_walkins_count;
