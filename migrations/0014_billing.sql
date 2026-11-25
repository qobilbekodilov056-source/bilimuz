CREATE TABLE IF NOT EXISTS tenant_plans (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free','pro','center')),
  expires_at INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL CHECK(plan IN ('pro','center')),
  months INTEGER NOT NULL DEFAULT 1,
  base_amount INTEGER NOT NULL,
  unique_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','expired','rejected')),
  receipt_key TEXT NOT NULL DEFAULT '',
  tx_note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS billing_orders_pending ON billing_orders(status, unique_amount, expires_at);
CREATE INDEX IF NOT EXISTS billing_orders_tenant ON billing_orders(tenant_id, created_at DESC);
