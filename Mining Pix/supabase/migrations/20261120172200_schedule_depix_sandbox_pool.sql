-- Cron retries the current UTC day's sandbox cycle every five minutes. Default daily
-- budget is zero. If a day is missed, no retrospective rewards are calculated.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'mining-pix-depix-sandbox-pool',
  '*/5 * * * *',
  'select depix_sandbox.settle_pool()'
);
