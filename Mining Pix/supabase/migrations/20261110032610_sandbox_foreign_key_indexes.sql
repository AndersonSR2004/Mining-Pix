create index if not exists sandbox_admin_events_actor_created_idx on private.sandbox_admin_events(actor_user_id,created_at desc);
create index if not exists sandbox_admin_events_block_idx on private.sandbox_admin_events(block_id);
create index if not exists sandbox_admin_events_session_created_idx on private.sandbox_admin_events(session_id,created_at desc);
create index if not exists sandbox_admin_events_target_user_idx on private.sandbox_admin_events(target_user_id);
create index if not exists sandbox_allocations_miner_idx on private.sandbox_allocations(miner_id);