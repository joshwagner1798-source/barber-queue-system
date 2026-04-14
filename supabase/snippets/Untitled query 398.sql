select tgname, tgrelid::regclass as table_name
from pg_trigger
where tgname in ('trg_sync_tv_walkins','trg_sync_tv_barber_status');

