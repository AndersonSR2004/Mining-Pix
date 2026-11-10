-- Keep sandbox state inaccessible to anon/authenticated table clients.
-- Administrative RPCs execute as their trusted postgres owner and validate
-- the caller through private.assert_sandbox_admin().
ALTER TABLE private.sandbox_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.sandbox_miners ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.sandbox_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.sandbox_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.sandbox_admin_events ENABLE ROW LEVEL SECURITY;
