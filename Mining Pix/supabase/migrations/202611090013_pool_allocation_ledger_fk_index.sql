create index pool_allocations_wallet_transaction_idx
on public.pool_allocations (wallet_transaction_id)
where wallet_transaction_id is not null;
