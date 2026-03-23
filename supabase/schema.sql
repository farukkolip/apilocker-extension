-- API Locker — Supabase Schema
-- Run this in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Vaults: stores one encrypted blob per user (zero-knowledge)
CREATE TABLE IF NOT EXISTS vaults (
  user_id        uuid REFERENCES auth.users PRIMARY KEY,
  encrypted_blob jsonb        NOT NULL,
  updated_at     timestamptz  DEFAULT now()
);

ALTER TABLE vaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own vault"
  ON vaults FOR ALL
  USING (auth.uid() = user_id);

-- 2. Profiles: tracks Pro status (updated by Stripe webhook)
CREATE TABLE IF NOT EXISTS profiles (
  user_id   uuid REFERENCES auth.users PRIMARY KEY,
  is_pro    boolean      DEFAULT false,
  pro_since timestamptz
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Service role only can update pro status (Stripe webhook uses service key)
CREATE POLICY "Service role updates profiles"
  ON profiles FOR UPDATE
  USING (auth.role() = 'service_role');

-- 3. Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
